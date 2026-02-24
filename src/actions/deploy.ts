import * as core from '@actions/core'
import * as models from '../types/kubernetesTypes.js'
import * as KubernetesConstants from '../types/kubernetesTypes.js'
import {Kubectl, Resource} from '../types/kubectl.js'
import {
   getResources,
   updateManifestFiles
} from '../utilities/manifestUpdateUtils.js'
import {
   annotateAndLabelResources,
   checkManifestStability,
   deployManifests
} from '../strategyHelpers/deploymentHelper.js'
import {DeploymentStrategy} from '../types/deploymentStrategy.js'
import {parseTrafficSplitMethod} from '../types/trafficSplitMethod.js'
import {ClusterType} from '../inputUtils.js'
export const ResourceTypeManagedCluster =
   'Microsoft.ContainerService/managedClusters'
export const ResourceTypeFleet = 'Microsoft.ContainerService/fleets'
export async function deploy(
   kubectl: Kubectl,
   manifestFilePaths: string[],
   deploymentStrategy: DeploymentStrategy,
   resourceType: ClusterType,
   timeout?: string
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
      trafficSplitMethod,
      timeout
   )
   core.debug(`Deployed manifest files: ${deployedManifestFiles}`)
   core.endGroup()

   // check manifest stability
   core.startGroup('Checking manifest stability')
   const resourceTypes: Resource[] = getResources(
      deployedManifestFiles,
      models.DEPLOYMENT_TYPES.concat([
         KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE
      ])
   )

   await checkManifestStability(kubectl, resourceTypes, resourceType, timeout)
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
