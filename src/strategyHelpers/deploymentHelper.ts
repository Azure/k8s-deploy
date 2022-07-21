import * as fs from 'fs'
import * as yaml from 'js-yaml'
import * as canaryDeploymentHelper from './canary/canaryHelper'
import * as models from '../types/kubernetesTypes'
import {isDeploymentEntity} from '../types/kubernetesTypes'
import * as fileHelper from '../utilities/fileUtils'
import * as KubernetesManifestUtility from '../utilities/manifestStabilityUtils'
import {Kubectl, Resource} from '../types/kubectl'

import {deployPodCanary} from './canary/podCanaryHelper'
import {deploySMICanary} from './canary/smiCanaryHelper'
import {DeploymentConfig} from '../types/deploymentConfig'
import {deployBlueGreenService} from './blueGreen/serviceBlueGreenHelper'
import {deployBlueGreenIngress} from './blueGreen/ingressBlueGreenHelper'
import {deployBlueGreenSMI} from './blueGreen/smiBlueGreenHelper'
import {DeploymentStrategy} from '../types/deploymentStrategy'
import * as core from '@actions/core'
import {
   parseTrafficSplitMethod,
   TrafficSplitMethod
} from '../types/trafficSplitMethod'
import {parseRouteStrategy, RouteStrategy} from '../types/routeStrategy'
import {ExecOutput} from '@actions/exec'
import {
   getWorkflowAnnotationKeyLabel,
   getWorkflowAnnotations,
   cleanLabel
} from '../utilities/workflowAnnotationUtils'
import {
   annotateChildPods,
   checkForErrors,
   getLastSuccessfulRunSha
} from '../utilities/kubectlUtils'
import {
   getWorkflowFilePath,
   normalizeWorkflowStrLabel
} from '../utilities/githubUtils'
import {getDeploymentConfig} from '../utilities/dockerUtils'

export async function deployManifests(
   files: string[],
   deploymentStrategy: DeploymentStrategy,
   kubectl: Kubectl,
   trafficSplitMethod: TrafficSplitMethod
): Promise<string[]> {
   switch (deploymentStrategy) {
      case DeploymentStrategy.CANARY: {
         const {result, newFilePaths} =
            trafficSplitMethod == TrafficSplitMethod.SMI
               ? await deploySMICanary(files, kubectl)
               : await deployPodCanary(files, kubectl)

         checkForErrors([result])
         return newFilePaths
      }

      case DeploymentStrategy.BLUE_GREEN: {
         const routeStrategy = parseRouteStrategy(
            core.getInput('route-method', {required: true})
         )

         const {result, newFilePaths} = await Promise.resolve(
            (routeStrategy == RouteStrategy.INGRESS &&
               deployBlueGreenIngress(kubectl, files)) ||
               (routeStrategy == RouteStrategy.SMI &&
                  deployBlueGreenSMI(kubectl, files)) ||
               deployBlueGreenService(kubectl, files)
         )

         checkForErrors([result])
         return newFilePaths
      }

      case DeploymentStrategy.BASIC: {
         const trafficSplitMethod = parseTrafficSplitMethod(
            core.getInput('traffic-split-method', {required: true})
         )

         const forceDeployment = core.getInput('force').toLowerCase() === 'true'
         if (trafficSplitMethod === TrafficSplitMethod.SMI) {
            const updatedManifests = appendStableVersionLabelToResource(files)

            const result = await kubectl.apply(
               updatedManifests,
               forceDeployment
            )
            checkForErrors([result])
         } else {
            const result = await kubectl.apply(files, forceDeployment)
            checkForErrors([result])
         }

         return files
      }

      default: {
         throw new Error('Deployment strategy is not recognized.')
      }
   }
}

function appendStableVersionLabelToResource(files: string[]): string[] {
   const manifestFiles = []
   const newObjectsList = []

   files.forEach((filePath: string) => {
      const fileContents = fs.readFileSync(filePath).toString()

      yaml.safeLoadAll(fileContents, function (inputObject) {
         const {kind} = inputObject

         if (isDeploymentEntity(kind)) {
            const updatedObject =
               canaryDeploymentHelper.markResourceAsStable(inputObject)
            newObjectsList.push(updatedObject)
         } else {
            manifestFiles.push(filePath)
         }
      })
   })

   const updatedManifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   manifestFiles.push(...updatedManifestFiles)

   return manifestFiles
}

export async function checkManifestStability(
   kubectl: Kubectl,
   resources: Resource[]
): Promise<void> {
   await KubernetesManifestUtility.checkManifestStability(kubectl, resources)
}

export async function annotateAndLabelResources(
   files: string[],
   kubectl: Kubectl,
   resourceTypes: Resource[],
   allPods: any
) {
   const githubToken = core.getInput('token')
   const workflowFilePath = await getWorkflowFilePath(githubToken)

   const deploymentConfig = await getDeploymentConfig()
   const annotationKeyLabel = getWorkflowAnnotationKeyLabel(workflowFilePath)

   await annotateResources(
      files,
      kubectl,
      resourceTypes,
      allPods,
      annotationKeyLabel,
      workflowFilePath,
      deploymentConfig
   )
   await labelResources(files, kubectl, annotationKeyLabel)
}

async function annotateResources(
   files: string[],
   kubectl: Kubectl,
   resourceTypes: Resource[],
   allPods: any,
   annotationKey: string,
   workflowFilePath: string,
   deploymentConfig: DeploymentConfig
) {
   const annotateResults: ExecOutput[] = []
   const namespace = core.getInput('namespace') || 'default'
   const lastSuccessSha = await getLastSuccessfulRunSha(
      kubectl,
      namespace,
      annotationKey
   )

   const annotationKeyValStr = `${annotationKey}=${getWorkflowAnnotations(
      lastSuccessSha,
      workflowFilePath,
      deploymentConfig
   )}`

   const annotateNamespace = !(
      core.getInput('annotate-namespace').toLowerCase() === 'false'
   )
   if (annotateNamespace) {
      annotateResults.push(
         await kubectl.annotate('namespace', namespace, annotationKeyValStr)
      )
   }
   annotateResults.push(await kubectl.annotateFiles(files, annotationKeyValStr))

   for (const resource of resourceTypes) {
      if (
         resource.type.toLowerCase() !==
         models.KubernetesWorkload.POD.toLowerCase()
      ) {
         ;(
            await annotateChildPods(
               kubectl,
               resource.type,
               resource.name,
               annotationKeyValStr,
               allPods
            )
         ).forEach((execResult) => annotateResults.push(execResult))
      }
   }

   checkForErrors(annotateResults, true)
}

async function labelResources(
   files: string[],
   kubectl: Kubectl,
   label: string
) {
   const labels = [
      `workflowFriendlyName=${cleanLabel(
         normalizeWorkflowStrLabel(process.env.GITHUB_WORKFLOW)
      )}`,
      `workflow=${cleanLabel(label)}`
   ]

   checkForErrors([await kubectl.labelFiles(files, labels)], true)
}
