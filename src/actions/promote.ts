import * as core from '@actions/core'
import * as canaryDeploymentHelper from '../strategyHelpers/canary/canaryHelper'
import * as SMICanaryDeploymentHelper from '../strategyHelpers/canary/smiCanaryHelper'
import * as PodCanaryHelper from '../strategyHelpers/canary/podCanaryHelper'
import {
   getResources,
   updateManifestFiles
} from '../utilities/manifestUpdateUtils'
import {annotateAndLabelResources} from '../strategyHelpers/deploymentHelper'
import * as models from '../types/kubernetesTypes'
import * as KubernetesManifestUtility from '../utilities/manifestStabilityUtils'
import {
   deleteGreenObjects,
   getManifestObjects,
   NONE_LABEL_VALUE
} from '../strategyHelpers/blueGreen/blueGreenHelper'

import {BlueGreenManifests} from '../types/blueGreenTypes'
import {DeployResult} from '../types/deployResult'

import {
   promoteBlueGreenIngress,
   promoteBlueGreenService,
   promoteBlueGreenSMI
} from '../strategyHelpers/blueGreen/promote'

import {
   routeBlueGreenService,
   routeBlueGreenIngressUnchanged,
   routeBlueGreenSMI
} from '../strategyHelpers/blueGreen/route'

import {cleanupSMI} from '../strategyHelpers/blueGreen/smiBlueGreenHelper'
import {Kubectl, Resource} from '../types/kubectl'
import {DeploymentStrategy} from '../types/deploymentStrategy'
import {
   parseTrafficSplitMethod,
   TrafficSplitMethod
} from '../types/trafficSplitMethod'
import {parseRouteStrategy, RouteStrategy} from '../types/routeStrategy'
import {ClusterType} from '../inputUtils'

export async function promote(
   kubectl: Kubectl,
   manifests: string[],
   deploymentStrategy: DeploymentStrategy,
   resourceType: ClusterType,
   timeout?: string
) {
   switch (deploymentStrategy) {
      case DeploymentStrategy.CANARY:
         await promoteCanary(kubectl, manifests, timeout)
         break
      case DeploymentStrategy.BLUE_GREEN:
         await promoteBlueGreen(kubectl, manifests, resourceType, timeout)
         break
      default:
         throw Error('Invalid promote deployment strategy')
   }
}

async function promoteCanary(
   kubectl: Kubectl,
   manifests: string[],
   timeout?: string
) {
   let includeServices = false

   const manifestFilesForDeployment: string[] = updateManifestFiles(manifests)

   const trafficSplitMethod = parseTrafficSplitMethod(
      core.getInput('traffic-split-method', {required: true})
   )
   let promoteResult: DeployResult
   let filesToAnnotate: string[]
   if (trafficSplitMethod == TrafficSplitMethod.SMI) {
      includeServices = true

      // In case of SMI traffic split strategy when deployment is promoted, first we will redirect traffic to
      // canary deployment, then update stable deployment and then redirect traffic to stable deployment
      core.startGroup('Redirecting traffic to canary deployment')
      await SMICanaryDeploymentHelper.redirectTrafficToCanaryDeployment(
         kubectl,
         manifests
      )
      core.endGroup()

      core.startGroup(
         'Deploying input manifests with SMI canary strategy from promote'
      )

      promoteResult = await SMICanaryDeploymentHelper.deploySMICanary(
         manifestFilesForDeployment,
         kubectl,
         true,
         timeout
      )

      core.endGroup()

      core.startGroup('Redirecting traffic to stable deployment')
      const stableRedirectManifests =
         await SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(
            kubectl,
            manifests,
            timeout
         )

      filesToAnnotate = promoteResult.manifestFiles.concat(
         stableRedirectManifests
      )

      core.endGroup()
   } else {
      core.startGroup('Deploying input manifests from promote')
      promoteResult = await PodCanaryHelper.deployPodCanary(
         manifestFilesForDeployment,
         kubectl,
         true,
         timeout
      )
      filesToAnnotate = promoteResult.manifestFiles
      core.endGroup()
   }

   core.startGroup('Deleting canary and baseline workloads')
   try {
      await canaryDeploymentHelper.deleteCanaryDeployment(
         kubectl,
         manifests,
         includeServices
      )
   } catch (ex) {
      core.warning(
         `Exception occurred while deleting canary and baseline workloads: ${ex}`
      )
   }
   core.endGroup()

   // annotate resources
   core.startGroup('Annotating resources')
   const resources: Resource[] = getResources(
      filesToAnnotate,
      models.DEPLOYMENT_TYPES.concat([
         models.DiscoveryAndLoadBalancerResource.SERVICE
      ])
   )
   await annotateAndLabelResources(filesToAnnotate, kubectl, resources)
   core.endGroup()
}

async function promoteBlueGreen(
   kubectl: Kubectl,
   manifests: string[],
   resourceType: ClusterType,
   timeout?: string
) {
   // update container images and pull secrets
   const inputManifestFiles: string[] = updateManifestFiles(manifests)
   const manifestObjects: BlueGreenManifests =
      getManifestObjects(inputManifestFiles)

   const routeStrategy = parseRouteStrategy(
      core.getInput('route-method', {required: true})
   )

   core.startGroup('Deleting old deployment and making new stable deployment')

   const {deployResult} = await (async () => {
      switch (routeStrategy) {
         case RouteStrategy.INGRESS:
            return await promoteBlueGreenIngress(
               kubectl,
               manifestObjects,
               timeout
            )
         case RouteStrategy.SMI:
            return await promoteBlueGreenSMI(kubectl, manifestObjects, timeout)
         default:
            return await promoteBlueGreenService(
               kubectl,
               manifestObjects,
               timeout
            )
      }
   })()

   core.endGroup()

   // checking stability of newly created deployments
   core.startGroup('Checking manifest stability')
   const deployedManifestFiles = deployResult.manifestFiles
   const resources: Resource[] = getResources(
      deployedManifestFiles,
      models.DEPLOYMENT_TYPES.concat([
         models.DiscoveryAndLoadBalancerResource.SERVICE
      ])
   )
   await KubernetesManifestUtility.checkManifestStability(
      kubectl,
      resources,
      resourceType,
      timeout
   )
   core.endGroup()

   core.startGroup(
      'Routing to new deployments and deleting old workloads and services'
   )
   if (routeStrategy == RouteStrategy.INGRESS) {
      await routeBlueGreenIngressUnchanged(
         kubectl,
         manifestObjects.serviceNameMap,
         manifestObjects.ingressEntityList
      )

      await deleteGreenObjects(
         kubectl,
         [].concat(
            manifestObjects.deploymentEntityList,
            manifestObjects.serviceEntityList
         ),
         timeout
      )
   } else if (routeStrategy == RouteStrategy.SMI) {
      await routeBlueGreenSMI(
         kubectl,
         NONE_LABEL_VALUE,
         manifestObjects.serviceEntityList
      )
      await deleteGreenObjects(
         kubectl,
         manifestObjects.deploymentEntityList,
         timeout
      )
      await cleanupSMI(kubectl, manifestObjects.serviceEntityList, timeout)
   } else {
      await routeBlueGreenService(
         kubectl,
         NONE_LABEL_VALUE,
         manifestObjects.serviceEntityList
      )
      await deleteGreenObjects(
         kubectl,
         manifestObjects.deploymentEntityList,
         timeout
      )
   }
   core.endGroup()

   // annotate resources
   core.startGroup('Annotating resources')
   await annotateAndLabelResources(deployedManifestFiles, kubectl, resources)
   core.endGroup()
}
