import * as core from '@actions/core'
import * as canaryDeploymentHelper from '../strategyHelpers/canary/canaryHelper.js'
import * as SMICanaryDeploymentHelper from '../strategyHelpers/canary/smiCanaryHelper.js'
import {Kubectl} from '../types/kubectl.js'
import {BlueGreenManifests} from '../types/blueGreenTypes.js'
import {
   rejectBlueGreenIngress,
   rejectBlueGreenService,
   rejectBlueGreenSMI
} from '../strategyHelpers/blueGreen/reject.js'
import {getManifestObjects} from '../strategyHelpers/blueGreen/blueGreenHelper.js'
import {DeploymentStrategy} from '../types/deploymentStrategy.js'
import {
   parseTrafficSplitMethod,
   TrafficSplitMethod
} from '../types/trafficSplitMethod.js'
import {parseRouteStrategy, RouteStrategy} from '../types/routeStrategy.js'

export async function reject(
   kubectl: Kubectl,
   manifests: string[],
   deploymentStrategy: DeploymentStrategy,
   timeout?: string
) {
   switch (deploymentStrategy) {
      case DeploymentStrategy.CANARY:
         await rejectCanary(kubectl, manifests, timeout)
         break
      case DeploymentStrategy.BLUE_GREEN:
         await rejectBlueGreen(kubectl, manifests, timeout)
         break
      default:
         throw 'Invalid delete deployment strategy'
   }
}

async function rejectCanary(
   kubectl: Kubectl,
   manifests: string[],
   timeout?: string
) {
   let includeServices = false

   const trafficSplitMethod = parseTrafficSplitMethod(
      core.getInput('traffic-split-method', {required: true})
   )
   if (trafficSplitMethod == TrafficSplitMethod.SMI) {
      core.startGroup('Rejecting deployment with SMI canary strategy')
      includeServices = true
      await SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(
         kubectl,
         manifests,
         timeout
      )
      core.endGroup()
   }

   core.startGroup('Deleting baseline and canary workloads')
   await canaryDeploymentHelper.deleteCanaryDeployment(
      kubectl,
      manifests,
      includeServices,
      timeout
   )
   core.endGroup()
}

async function rejectBlueGreen(
   kubectl: Kubectl,
   manifests: string[],
   timeout?: string
) {
   const routeStrategy = parseRouteStrategy(
      core.getInput('route-method', {required: true})
   )
   core.startGroup('Rejecting deployment with blue green strategy')
   core.info(`using routeMethod ${routeStrategy}`)
   const manifestObjects: BlueGreenManifests = getManifestObjects(manifests)

   if (routeStrategy == RouteStrategy.INGRESS) {
      await rejectBlueGreenIngress(kubectl, manifestObjects, timeout)
   } else if (routeStrategy == RouteStrategy.SMI) {
      await rejectBlueGreenSMI(kubectl, manifestObjects, timeout)
   } else {
      await rejectBlueGreenService(kubectl, manifestObjects, timeout)
   }
   core.endGroup()
}
