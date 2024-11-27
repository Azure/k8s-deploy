import * as core from '@actions/core'
import * as KubernetesConstants from '../types/kubernetesTypes'
import {Kubectl, Resource} from '../types/kubectl'
import {checkForErrors} from './kubectlUtils'
import {sleep} from './timeUtils'

const IS_SILENT = false
const POD = 'pod'

export async function checkManifestStability(
   kubectl: Kubectl,
   resources: Resource[],
   resourceType: string
): Promise<void> {
   // Skip if resource type is microsoft.containerservice/fleets
   if (resourceType.toLowerCase() === 'microsoft.containerservice/fleets') {
      core.info(
         'Skipping checkManifestStability for microsoft.containerservice/fleets'
      )
      return
   }
   let rolloutStatusHasErrors = false
   for (let i = 0; i < resources.length; i++) {
      const resource = resources[i]

      if (
         KubernetesConstants.WORKLOAD_TYPES_WITH_ROLLOUT_STATUS.indexOf(
            resource.type.toLowerCase()
         ) >= 0
      ) {
         try {
            const result = await kubectl.checkRolloutStatus(
               resource.type,
               resource.name,
               resource.namespace
            )
            checkForErrors([result])
         } catch (ex) {
            core.error(ex)
            await kubectl.describe(
               resource.type,
               resource.name,
               IS_SILENT,
               resource.namespace
            )
            rolloutStatusHasErrors = true
         }
      }

      if (resource.type == KubernetesConstants.KubernetesWorkload.POD) {
         try {
            await checkPodStatus(kubectl, resource)
         } catch (ex) {
            core.warning(
               `Could not determine pod status: ${JSON.stringify(ex)}`
            )
            await kubectl.describe(
               resource.type,
               resource.name,
               IS_SILENT,
               resource.namespace
            )
         }
      }
      if (
         resource.type ==
         KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE
      ) {
         try {
            const service = await getService(kubectl, resource)
            const {spec, status} = service
            if (spec.type === KubernetesConstants.ServiceTypes.LOAD_BALANCER) {
               if (!isLoadBalancerIPAssigned(status)) {
                  await waitForServiceExternalIPAssignment(kubectl, resource)
               } else {
                  core.info(
                     `ServiceExternalIP ${resource.name} ${status.loadBalancer.ingress[0].ip}`
                  )
               }
            }
         } catch (ex) {
            core.warning(
               `Could not determine service status of: ${resource.name} Error: ${ex}`
            )
            await kubectl.describe(
               resource.type,
               resource.name,
               IS_SILENT,
               resource.namespace
            )
         }
      }
   }

   if (rolloutStatusHasErrors) {
      throw new Error('Rollout status error')
   }
}

export async function checkPodStatus(
   kubectl: Kubectl,
   pod: Resource
): Promise<void> {
   const sleepTimeout = 10 * 1000 // 10 seconds
   const iterations = 60 // 60 * 10 seconds timeout = 10 minutes max timeout

   let podStatus
   let kubectlDescribeNeeded = false
   for (let i = 0; i < iterations; i++) {
      await sleep(sleepTimeout)

      core.debug(`Polling for pod status: ${pod.name}`)
      podStatus = await getPodStatus(kubectl, pod)

      if (
         podStatus &&
         podStatus?.phase !== 'Pending' &&
         podStatus?.phase !== 'Unknown'
      ) {
         break
      }
   }

   podStatus = await getPodStatus(kubectl, pod)
   switch (podStatus.phase) {
      case 'Succeeded':
      case 'Running':
         if (isPodReady(podStatus)) {
            console.log(`pod/${pod.name} is successfully rolled out`)
         } else {
            kubectlDescribeNeeded = true
         }
         break
      case 'Pending':
         if (!isPodReady(podStatus)) {
            core.warning(`pod/${pod.name} rollout status check timed out`)
            kubectlDescribeNeeded = true
         }
         break
      case 'Failed':
         core.error(`pod/${pod.name} rollout failed`)
         kubectlDescribeNeeded = true
         break
      default:
         core.warning(`pod/${pod.name} rollout status: ${podStatus.phase}`)
   }

   if (kubectlDescribeNeeded) {
      await kubectl.describe(POD, pod.name, IS_SILENT, pod.namespace)
   }
}

async function getPodStatus(kubectl: Kubectl, pod: Resource) {
   const podResult = await kubectl.getResource(
      POD,
      pod.name,
      IS_SILENT,
      pod.namespace
   )
   checkForErrors([podResult])

   return JSON.parse(podResult.stdout).status
}

function isPodReady(podStatus: any): boolean {
   let allContainersAreReady = true
   podStatus.containerStatuses.forEach((container) => {
      if (container.ready === false) {
         core.info(
            `'${container.name}' status: ${JSON.stringify(container.state)}`
         )
         allContainersAreReady = false
      }
   })

   if (!allContainersAreReady) {
      core.warning('All containers not in ready state')
   }

   return allContainersAreReady
}

async function getService(kubectl: Kubectl, service: Resource) {
   const serviceResult = await kubectl.getResource(
      KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE,
      service.name,
      IS_SILENT,
      service.namespace
   )

   checkForErrors([serviceResult])
   return JSON.parse(serviceResult.stdout)
}

async function waitForServiceExternalIPAssignment(
   kubectl: Kubectl,
   service: Resource
): Promise<void> {
   const sleepTimeout = 10 * 1000 // 10 seconds
   const iterations = 18 // 18 * 10 seconds timeout = 3 minutes max timeout

   for (let i = 0; i < iterations; i++) {
      core.info(`Wait for service ip assignment : ${service.name}`)
      await sleep(sleepTimeout)

      const status = (await getService(kubectl, service)).status
      if (isLoadBalancerIPAssigned(status)) {
         core.info(
            `ServiceExternalIP ${service.name} ${status.loadBalancer.ingress[0].ip}`
         )
         return
      }
   }

   core.warning(`Wait for service ip assignment timed out ${service.name}`)
}

function isLoadBalancerIPAssigned(status: any) {
   return status?.loadBalancer?.ingress?.length > 0
}
