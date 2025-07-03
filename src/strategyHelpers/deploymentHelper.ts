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
import {deployBlueGreen} from './blueGreen/deploy'
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
import {DeployResult} from '../types/deployResult'
import {ClusterType} from '../inputUtils'
import {BlueGreenDeployment} from '../types/blueGreenTypes'

export async function deployManifests(
   files: string[],
   deploymentStrategy: DeploymentStrategy,
   kubectl: Kubectl,
   trafficSplitMethod: TrafficSplitMethod,
   timeout?: string
): Promise<string[]> {
   switch (deploymentStrategy) {
      case DeploymentStrategy.CANARY: {
         const canaryDeployResult: DeployResult =
            trafficSplitMethod == TrafficSplitMethod.SMI
               ? await deploySMICanary(files, kubectl, false, timeout)
               : await deployPodCanary(files, kubectl, false, timeout)

         checkForErrors([canaryDeployResult.execResult])
         return canaryDeployResult.manifestFiles
      }

      case DeploymentStrategy.BLUE_GREEN: {
         const routeStrategy = parseRouteStrategy(
            core.getInput('route-method', {required: true})
         )
         const blueGreenDeployment = await deployBlueGreen(
            kubectl,
            files,
            routeStrategy,
            timeout
         )
         core.debug(
            `objects deployed for ${routeStrategy}: ${JSON.stringify(
               blueGreenDeployment.objects
            )} `
         )

         checkForErrors([blueGreenDeployment.deployResult.execResult])
         const deployedManifestFiles =
            blueGreenDeployment.deployResult.manifestFiles
         core.debug(
            `from blue-green service, deployed manifest files are ${deployedManifestFiles}`
         )
         return deployedManifestFiles
      }

      case DeploymentStrategy.BASIC: {
         const trafficSplitMethod = parseTrafficSplitMethod(
            core.getInput('traffic-split-method', {required: true})
         )

         const forceDeployment = core.getInput('force').toLowerCase() === 'true'
         const serverSideApply =
            core.getInput('server-side').toLowerCase() === 'true'
         if (trafficSplitMethod === TrafficSplitMethod.SMI) {
            const updatedManifests = appendStableVersionLabelToResource(files)

            const result = await kubectl.apply(
               updatedManifests,
               forceDeployment,
               serverSideApply,
               timeout
            )
            checkForErrors([result])
         } else {
            const result = await kubectl.apply(
               files,
               forceDeployment,
               serverSideApply,
               timeout
            )
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
      try {
         const fileContents = fs.readFileSync(filePath).toString()

         yaml.loadAll(fileContents, function (inputObject) {
            const kind = (inputObject as {kind: string}).kind

            if (isDeploymentEntity(kind)) {
               const updatedObject =
                  canaryDeploymentHelper.markResourceAsStable(inputObject)
               newObjectsList.push(updatedObject)
            } else {
               manifestFiles.push(filePath)
            }
         })
      } catch (error) {
         core.error(`Failed to parse file at ${filePath}: ${error.message}`)
         throw error
      }
   })

   const updatedManifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   manifestFiles.push(...updatedManifestFiles)

   return manifestFiles
}

export async function checkManifestStability(
   kubectl: Kubectl,
   resources: Resource[],
   resourceType: ClusterType,
   timeout?: string
): Promise<void> {
   await KubernetesManifestUtility.checkManifestStability(
      kubectl,
      resources,
      resourceType,
      timeout
   )
}

export async function annotateAndLabelResources(
   files: string[],
   kubectl: Kubectl,
   resourceTypes: Resource[]
) {
   const defaultWorkflowFileName = 'k8s-deploy-failed-workflow-annotation'
   const githubToken = core.getInput('token')
   let workflowFilePath
   try {
      workflowFilePath = await getWorkflowFilePath(githubToken)
   } catch (ex) {
      core.warning(`Failed to extract workflow file name: ${ex}`)
      workflowFilePath = defaultWorkflowFileName
   }

   const deploymentConfig = await getDeploymentConfig()
   const annotationKeyLabel = getWorkflowAnnotationKeyLabel()

   const shouldAnnotateResources = !(
      core.getInput('annotate-resources').toLowerCase() === 'false'
   )

   if (shouldAnnotateResources) {
      await annotateResources(
         files,
         kubectl,
         resourceTypes,
         annotationKeyLabel,
         workflowFilePath,
         deploymentConfig
      ).catch((err) => core.warning(`Failed to annotate resources: ${err} `))
   }

   await labelResources(files, kubectl, annotationKeyLabel).catch((err) =>
      core.warning(`Failed to label resources: ${err}`)
   )
}

async function annotateResources(
   files: string[],
   kubectl: Kubectl,
   resourceTypes: Resource[],
   annotationKey: string,
   workflowFilePath: string,
   deploymentConfig: DeploymentConfig
) {
   const annotateResults: ExecOutput[] = []
   const namespace = core.getInput('namespace') || '' // Sets namespace to an empty string if not provided, allowing the manifest-defined namespace to take precedence instead of "default".
   const lastSuccessSha = await getLastSuccessfulRunSha(
      kubectl,
      namespace,
      annotationKey
   )

   if (core.isDebug()) {
      try {
         core.debug(`files getting annotated are ${JSON.stringify(files)}`)
         for (const filePath of files) {
            core.debug('printing objects getting annotated...')
            const fileContents = fs.readFileSync(filePath).toString()
            const inputObjects = yaml.loadAll(fileContents)
            for (const inputObject of inputObjects) {
               core.debug(`object: ${JSON.stringify(inputObject)}`)
            }
         }
      } catch (error) {
         core.error(`Failed to load and parse files: ${error.message}`)
         throw error
      }
   }

   const annotationKeyValStr = `${annotationKey}=${getWorkflowAnnotations(
      lastSuccessSha,
      workflowFilePath,
      deploymentConfig
   )}`

   const annotateNamespace = !(
      namespace === '' ||
      core.getInput('annotate-namespace').toLowerCase() === 'false'
   ) // If namespace is empty, we don't annotate it. If the input is false, we also don't annotate it.

   if (annotateNamespace) {
      annotateResults.push(
         await kubectl.annotate(
            'namespace',
            namespace,
            annotationKeyValStr,
            namespace
         )
      )
   }

   for (const file of files) {
      try {
         const annotateResult = await kubectl.annotateFiles(
            file,
            annotationKeyValStr,
            namespace
         )
         annotateResults.push(annotateResult)
      } catch (e) {
         core.warning(`failed to annotate resource: ${e}`)
      }
   }

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
               resource.namespace,
               annotationKeyValStr
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

   const labelResults = []
   for (const file of files) {
      try {
         const labelResult = await kubectl.labelFiles(file, labels)
         labelResults.push(labelResult)
      } catch (e) {
         core.warning(`failed to annotate resource: ${e}`)
      }
   }
   checkForErrors(labelResults, true)
}
