import * as core from '@actions/core'
import * as KubernetesConstants from '../types/kubernetesTypes'
import {Kubectl, Resource} from '../types/kubectl'
import {checkForErrors} from './kubectlUtils'
import {sleep} from './timeUtils'
import {ResourceTypeFleet} from '../actions/deploy'
import {ClusterType} from '../inputUtils'

const IS_SILENT = false
const POD = 'pod'

export async function checkManifestStability(
   kubectl: Kubectl,
   resources: Resource[],
   resourceType: ClusterType,
   timeout?: string
): Promise<void> {
   // Skip if resource type is microsoft.containerservice/fleets
   if (resourceType === ResourceTypeFleet) {
      core.info(`Skipping checkManifestStability for ${ResourceTypeFleet}`)
      return
   }
   let rolloutStatusHasErrors = false
   // Collect errors for reporting
   // This will be used to throw a detailed error at the end if any rollout fails
   // This is useful for debugging and understanding which resources failed
   // their rollout status check
   // It will also include the describe output for the resource that failed
   // to provide more context on the failure
   const rolloutErrors: string[] = []

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
               resource.namespace,
               timeout
            )
            checkForErrors([result])
         } catch (ex) {
            const errorMessage = `Rollout failed for ${resource.type}/${resource.name} in namespace ${resource.namespace}: ${ex.message || ex}`
            core.error(errorMessage)
            rolloutErrors.push(errorMessage)

            // Get more detailed information
            try {
               const describeResult = await kubectl.describe(
                  resource.type,
                  resource.name,
                  IS_SILENT,
                  resource.namespace
               )
               core.info(
                  `Describe output for ${resource.type}/${resource.name}:\n${describeResult.stdout}`
               )
            } catch (describeEx) {
               core.warning(
                  `Could not describe ${resource.type}/${resource.name}: ${describeEx}`
               )
            }

            rolloutStatusHasErrors = true
         }
      }

      if (
         resource.type.toLowerCase() ===
         KubernetesConstants.KubernetesWorkload.POD.toLowerCase()
      ) {
         try {
            await exports.checkPodStatus(kubectl, resource)
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
            const errorMessage = `Could not determine service status of: ${resource.name} in namespace ${resource.namespace}. Error: ${ex.message || ex}`
            core.warning(errorMessage)

            try {
               const describeResult = await kubectl.describe(
                  resource.type,
                  resource.name,
                  IS_SILENT,
                  resource.namespace
               )
               core.info(
                  `Describe output for service/${resource.name}:\n${describeResult.stdout}`
               )
            } catch (describeEx) {
               core.warning(
                  `Could not describe service/${resource.name}: ${describeEx}`
               )
            }
         }
      }
   }

   if (rolloutStatusHasErrors) {
      const detailedError = `Rollout status failed for the following resources:\n${rolloutErrors.join('\n')}`
      throw new Error(detailedError)
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
   let errorDetails = ''

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
   // Get container statuses for detailed error information
   const containerErrors = getContainerErrors(podStatus)
   switch (podStatus.phase) {
      case 'Succeeded':
      case 'Running':
         if (isPodReady(podStatus)) {
            console.log(`pod/${pod.name} is successfully rolled out`)
         } else {
            errorDetails = `Pod ${pod.name} is ${podStatus.phase} but not ready. ${containerErrors}`
            core.error(errorDetails)
            kubectlDescribeNeeded = true
         }
         break
      case 'Pending':
         if (!isPodReady(podStatus)) {
            errorDetails = `Pod ${pod.name} rollout status check timed out (still Pending after ${(iterations * sleepTimeout) / 1000} seconds). ${containerErrors}`
            core.warning(errorDetails)
            kubectlDescribeNeeded = true
         }
         break
      case 'Failed':
         errorDetails = `Pod ${pod.name} rollout failed. ${containerErrors}`
         core.error(errorDetails)
         kubectlDescribeNeeded = true
         break
      default:
         errorDetails = `Pod ${pod.name} has unexpected status: ${podStatus.phase}. ${containerErrors}`
         core.warning(errorDetails)
         kubectlDescribeNeeded = true
   }

   if (kubectlDescribeNeeded) {
      try {
         const describeResult = await kubectl.describe(
            POD,
            pod.name,
            IS_SILENT,
            pod.namespace
         )
         core.info(
            `Describe output for pod/${pod.name}:\n${describeResult.stdout}`
         )
      } catch (describeEx) {
         core.warning(`Could not describe pod/${pod.name}: ${describeEx}`)
      }

      // Throw error with detailed information
      if (errorDetails) {
         throw new Error(errorDetails)
      }
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

export function getContainerErrors(podStatus: any): string {
   const errors: string[] = []
   const collectErrors = (containers: any[], label: string) => {
      containers?.forEach(({name, ready, state}) => {
         if (!ready) {
            if (state?.waiting) {
               errors.push(
                  `${label} '${name}' is waiting: ${state.waiting.reason} - ${state.waiting.message || 'No message'}`
               )
            } else if (state?.terminated) {
               errors.push(
                  `${label} '${name}' terminated: ${state.terminated.reason} - ${state.terminated.message || 'No message'}`
               )
            } else {
               errors.push(
                  `${label} '${name}' is not ready: ${JSON.stringify(state)}`
               )
            }
         }
      })
   }
   collectErrors(podStatus.containerStatuses, 'Container')
   collectErrors(podStatus.initContainerStatuses, 'Init container')

   return errors.length ? `Container issues: ${errors.join('; ')}` : ''
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
