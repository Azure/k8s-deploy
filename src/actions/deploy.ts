import * as core from '@actions/core'
import * as models from '../types/kubernetesTypes'
import * as KubernetesConstants from '../types/kubernetesTypes'
import {Kubectl, Resource} from '../types/kubectl'
import {
   getResources,
   updateManifestFiles
} from '../utilities/manifestUpdateUtils'
import {
   annotateAndLabelResources,
   checkManifestStability,
   deployManifests
} from '../strategyHelpers/deploymentHelper'
import {DeploymentStrategy} from '../types/deploymentStrategy'
import {parseTrafficSplitMethod} from '../types/trafficSplitMethod'
export const ResourceTypeManagedCluster =
   'Microsoft.ContainerService/managedClusters'
export const ResourceTypeFleet = 'Microsoft.ContainerService/fleets'
export type ClusterType =
   | typeof ResourceTypeManagedCluster
   | typeof ResourceTypeFleet

export async function deploy(
   kubectl: Kubectl,
   manifestFilePaths: string[],
   deploymentStrategy: DeploymentStrategy
) {
   // update manifests
   const inputManifestFiles: string[] = updateManifestFiles(manifestFilePaths)
   core.debug(`Input manifest files: ${inputManifestFiles}`)

   // deploy manifests
   core.startGroup('Deploying manifests')
   const trafficSplitMethod = parseTrafficSplitMethod(
      core.getInput('traffic-split-method', {required: true})
   )
   const deployedManifestFiles = await deployManifests(
      inputManifestFiles,
      deploymentStrategy,
      kubectl,
      trafficSplitMethod
   )
   core.debug(`Deployed manifest files: ${deployedManifestFiles}`)
   core.endGroup()

   // check manifest stability
   core.startGroup('Checking manifest stability')
   const resourceTypeInput =
      core.getInput('resource-type') || ResourceTypeManagedCluster
   const resourceTypes: Resource[] = getResources(
      deployedManifestFiles,
      models.DEPLOYMENT_TYPES.concat([
         KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE
      ])
   )

   if (
      resourceTypeInput !== ResourceTypeManagedCluster &&
      resourceTypeInput !== ResourceTypeFleet
   ) {
      let errMsg = `Invalid resource type: ${resourceTypeInput}. Supported resource types are: ${ResourceTypeManagedCluster} (default), ${ResourceTypeFleet}`
      core.setFailed(errMsg)
      throw new Error(errMsg)
   }

   await checkManifestStability(kubectl, resourceTypes, resourceTypeInput)
   core.endGroup()

   // print ingresses
   core.startGroup('Printing ingresses')
   const ingressResources: Resource[] = getResources(deployedManifestFiles, [
      KubernetesConstants.DiscoveryAndLoadBalancerResource.INGRESS
   ])
   for (const ingressResource of ingressResources) {
      await kubectl.getResource(
         KubernetesConstants.DiscoveryAndLoadBalancerResource.INGRESS,
         ingressResource.name,
         false,
         ingressResource.namespace
      )
   }
   core.endGroup()

   // annotate resources
   core.startGroup('Annotating resources')
   await annotateAndLabelResources(
      deployedManifestFiles,
      kubectl,
      resourceTypes
   )
   core.endGroup()
}
