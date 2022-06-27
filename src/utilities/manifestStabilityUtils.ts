import * as core from '@actions/core'
import * as KubernetesConstants from '../types/kubernetesTypes'
import {Kubectl, Resource} from '../types/kubectl'
import {checkForErrors} from './kubectlUtils'
import {sleep} from './timeUtils'

export async function checkManifestStability(
   kubectl: Kubectl,
   resources: Resource[]
): Promise<void> {
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
               resource.name
            )
            checkForErrors([result])
         } catch (ex) {
            core.error(ex)
            await kubectl.describe(resource.type, resource.name)
            rolloutStatusHasErrors = true
         }
      }

      if (resource.type == KubernetesConstants.KubernetesWorkload.POD) {
         try {
            await checkPodStatus(kubectl, resource.name)
         } catch (ex) {
            core.warning(
               `Could not determine pod status: ${JSON.stringify(ex)}`
            )
            await kubectl.describe(resource.type, resource.name)
         }
      }
      if (
         resource.type ==
         KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE
      ) {
         try {
            const service = await getService(kubectl, resource.name)
            const {spec, status} = service
            if (spec.type === KubernetesConstants.ServiceTypes.LOAD_BALANCER) {
               if (!isLoadBalancerIPAssigned(status)) {
                  await waitForServiceExternalIPAssignment(
                     kubectl,
                     resource.name
                  )
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
            await kubectl.describe(resource.type, resource.name)
         }
      }
   }

   if (rolloutStatusHasErrors) {
      throw new Error('Rollout status error')
   }
}

export async function checkPodStatus(
   kubectl: Kubectl,
   podName: string
): Promise<void> {
   const sleepTimeout = 10 * 1000 // 10 seconds
   const iterations = 60 // 60 * 10 seconds timeout = 10 minutes max timeout

   let podStatus
   let kubectlDescribeNeeded = false
   for (let i = 0; i < iterations; i++) {
      await sleep(sleepTimeout)

      core.debug(`Polling for pod status: ${podName}`)
      podStatus = await getPodStatus(kubectl, podName)

      if (
         podStatus &&
         podStatus?.phase !== 'Pending' &&
         podStatus?.phase !== 'Unknown'
      ) {
         break
      }
   }

   podStatus = await getPodStatus(kubectl, podName)
   switch (podStatus.phase) {
      case 'Succeeded':
      case 'Running':
         if (isPodReady(podStatus)) {
            console.log(`pod/${podName} is successfully rolled out`)
         } else {
            kubectlDescribeNeeded = true
         }
         break
      case 'Pending':
         if (!isPodReady(podStatus)) {
            core.warning(`pod/${podName} rollout status check timed out`)
            kubectlDescribeNeeded = true
         }
         break
      case 'Failed':
         core.error(`pod/${podName} rollout failed`)
         kubectlDescribeNeeded = true
         break
      default:
         core.warning(`pod/${podName} rollout status: ${podStatus.phase}`)
   }

   if (kubectlDescribeNeeded) {
      await kubectl.describe('pod', podName)
   }
}

async function getPodStatus(kubectl: Kubectl, podName: string) {
   const podResult = await kubectl.getResource('pod', podName)
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

async function getService(kubectl: Kubectl, serviceName) {
   const serviceResult = await kubectl.getResource(
      KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE,
      serviceName
   )

   checkForErrors([serviceResult])
   return JSON.parse(serviceResult.stdout)
}

async function waitForServiceExternalIPAssignment(
   kubectl: Kubectl,
   serviceName: string
): Promise<void> {
   const sleepTimeout = 10 * 1000 // 10 seconds
   const iterations = 18 // 18 * 10 seconds timeout = 3 minutes max timeout

   for (let i = 0; i < iterations; i++) {
      core.info(`Wait for service ip assignment : ${serviceName}`)
      await sleep(sleepTimeout)

      const status = (await getService(kubectl, serviceName)).status
      if (isLoadBalancerIPAssigned(status)) {
         core.info(
            `ServiceExternalIP ${serviceName} ${status.loadBalancer.ingress[0].ip}`
         )
         return
      }
   }

   core.warning(`Wait for service ip assignment timed out${serviceName}`)
}

function isLoadBalancerIPAssigned(status: any) {
   return status?.loadBalancer?.ingress?.length > 0
}
