import * as manifestStabilityUtils from './manifestStabilityUtils'
import {Kubectl} from '../types/kubectl'
import {ResourceTypeFleet, ResourceTypeManagedCluster} from '../actions/deploy'
import {ExecOutput} from '@actions/exec'
import {exitCode, stdout} from 'process'
import * as core from '@actions/core'
import * as timeUtils from './timeUtils'

describe('manifestStabilityUtils', () => {
   const kc = new Kubectl('')
   const resources = [
      {
         type: 'deployment',
         name: 'test',
         namespace: 'default'
      }
   ]

   it('should return immediately if the resource type is fleet', async () => {
      const spy = jest.spyOn(manifestStabilityUtils, 'checkManifestStability')
      const checkRolloutStatusSpy = jest.spyOn(kc, 'checkRolloutStatus')
      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeFleet
      )

      expect(checkRolloutStatusSpy).not.toHaveBeenCalled()
      expect(spy).toHaveReturned()
   })

   it('should run fully if the resource type is managedCluster', async () => {
      const spy = jest.spyOn(manifestStabilityUtils, 'checkManifestStability')
      const checkRolloutStatusSpy = jest
         .spyOn(kc, 'checkRolloutStatus')
         .mockImplementation(() => {
            return new Promise<ExecOutput>((resolve, reject) => {
               resolve({
                  exitCode: 0,
                  stderr: '',
                  stdout: ''
               })
            })
         })
      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster
      )

      expect(checkRolloutStatusSpy).toHaveBeenCalled()
      expect(spy).toHaveReturned()
   })

   it('should pass timeout to checkRolloutStatus when provided', async () => {
      const timeout = '300s'
      const checkRolloutStatusSpy = jest
         .spyOn(kc, 'checkRolloutStatus')
         .mockImplementation(() => {
            return new Promise<ExecOutput>((resolve, reject) => {
               resolve({
                  exitCode: 0,
                  stderr: '',
                  stdout: ''
               })
            })
         })

      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster,
         timeout
      )

      expect(checkRolloutStatusSpy).toHaveBeenCalledWith(
         'deployment',
         'test',
         'default',
         timeout
      )
   })

   it('should call checkRolloutStatus without timeout when not provided', async () => {
      const checkRolloutStatusSpy = jest
         .spyOn(kc, 'checkRolloutStatus')
         .mockImplementation(() => {
            return new Promise<ExecOutput>((resolve, reject) => {
               resolve({
                  exitCode: 0,
                  stderr: '',
                  stdout: ''
               })
            })
         })

      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster
      )

      expect(checkRolloutStatusSpy).toHaveBeenCalledWith(
         'deployment',
         'test',
         'default',
         undefined
      )
   })
})

describe('checkManifestStability failure and resource-specific scenarios', () => {
   let kc: Kubectl
   let coreErrorSpy: jest.SpyInstance
   let coreInfoSpy: jest.SpyInstance
   let coreWarningSpy: jest.SpyInstance

   beforeEach(() => {
      kc = new Kubectl('', 'default')
      coreErrorSpy = jest.spyOn(core, 'error').mockImplementation()
      coreInfoSpy = jest.spyOn(core, 'info').mockImplementation()
      coreWarningSpy = jest.spyOn(core, 'warning').mockImplementation()
   })

   afterEach(() => {
      jest.restoreAllMocks()
   })

   it('should call describe and collect errors when a rollout fails', async () => {
      const resources = [
         {type: 'deployment', name: 'failing-app', namespace: 'app-ns-123'}
      ]
      const rolloutError = new Error('Progress deadline exceeded')
      const describeOutput =
         'Events:\n  Type\tReason\tMessage\n  Normal\tScalingReplicaSet\tScaled up replica set failing-app-123 to 1'

      // Arrange: Mock rollout to fail and describe to succeed
      const checkRolloutStatusSpy = jest
         .spyOn(kc, 'checkRolloutStatus')
         .mockRejectedValue(rolloutError)
      const describeSpy = jest.spyOn(kc, 'describe').mockResolvedValue({
         stdout: describeOutput,
         stderr: '',
         exitCode: 0
      })

      // Act & Assert: Expect the function to throw the final aggregated error
      const expectedErrorMessage = `Rollout failed for deployment/failing-app in namespace app-ns-123: ${rolloutError.message}`
      await expect(
         manifestStabilityUtils.checkManifestStability(
            kc,
            resources,
            ResourceTypeManagedCluster
         )
      ).rejects.toThrow(
         `Rollout status failed for the following resources:\n${expectedErrorMessage}`
      )

      // Assert that the correct functions were called
      expect(checkRolloutStatusSpy).toHaveBeenCalledTimes(1)
      expect(coreErrorSpy).toHaveBeenCalledWith(expectedErrorMessage)
      expect(describeSpy).toHaveBeenCalledWith(
         'deployment',
         'failing-app',
         false,
         'app-ns-123'
      )
      expect(coreInfoSpy).toHaveBeenCalledWith(
         `Describe output for deployment/failing-app:\n${describeOutput}`
      )
   })

   it('should use the default kubectl namespace when none is provided', async () => {
      const resources = [{type: 'deployment', name: 'failing-app'}]
      const rolloutError = new Error('Progress deadline exceeded')
      const describeOutput =
         'Events:\n  Type\tReason\tMessage\n  Normal\tScalingReplicaSet\tScaled up replica set failing-app-123 to 1'

      // Arrange: Mock rollout to fail and describe to succeed
      const checkRolloutStatusSpy = jest
         .spyOn(kc, 'checkRolloutStatus')
         .mockRejectedValue(rolloutError)
      const describeSpy = jest.spyOn(kc, 'describe').mockResolvedValue({
         stdout: describeOutput,
         stderr: '',
         exitCode: 0
      })

      // Act & Assert: Expect the function to throw the final aggregated error
      const expectedErrorMessage = `Rollout failed for deployment/failing-app in namespace default: ${rolloutError.message}`
      await expect(
         manifestStabilityUtils.checkManifestStability(
            kc,
            resources,
            ResourceTypeManagedCluster
         )
      ).rejects.toThrow(
         `Rollout status failed for the following resources:\n${expectedErrorMessage}`
      )

      // Assert that the correct functions were called
      expect(checkRolloutStatusSpy).toHaveBeenCalledTimes(1)
      expect(coreErrorSpy).toHaveBeenCalledWith(expectedErrorMessage)
      expect(describeSpy).toHaveBeenCalledWith(
         'deployment',
         'failing-app',
         false,
         undefined
      )
      expect(coreInfoSpy).toHaveBeenCalledWith(
         `Describe output for deployment/failing-app:\n${describeOutput}`
      )
   })

   it('should call checkPodStatus for pod resources', async () => {
      const resources = [{type: 'Pod', name: 'test-pod', namespace: 'default'}]

      // Arrange: Spy on checkPodStatus and checkRolloutStatus
      const checkPodStatusSpy = jest
         .spyOn(manifestStabilityUtils, 'checkPodStatus')
         .mockResolvedValue() // Assume pod becomes ready
      const checkRolloutStatusSpy = jest.spyOn(kc, 'checkRolloutStatus')

      // Act
      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster
      )

      // Assert
      expect(checkPodStatusSpy).toHaveBeenCalledWith(kc, resources[0])
      expect(checkRolloutStatusSpy).not.toHaveBeenCalled()
   })

   it('should warn and describe when a pod check fails', async () => {
      const resources = [
         {type: 'Pod', name: 'failing-pod', namespace: 'default'}
      ]
      const podError = new Error('Pod rollout failed')

      // Arrange: Mock checkPodStatus to fail
      const checkPodStatusSpy = jest
         .spyOn(manifestStabilityUtils, 'checkPodStatus')
         .mockRejectedValue(podError)
      const describeSpy = jest.spyOn(kc, 'describe').mockResolvedValue({
         stdout: 'describe output',
         stderr: '',
         exitCode: 0
      })

      // Act: This should not throw, only warn.
      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster
      )

      // Assert
      expect(checkPodStatusSpy).toHaveBeenCalled()
      expect(coreWarningSpy).toHaveBeenCalledWith(
         expect.stringContaining(`Could not determine pod status`)
      )
      expect(describeSpy).toHaveBeenCalledWith(
         'Pod',
         'failing-pod',
         false,
         'default'
      )
   })

   it('should wait for external IP for a LoadBalancer service', async () => {
      //Spying on sleep to avoid actual delays in tests
      jest.spyOn(timeUtils, 'sleep').mockResolvedValue(undefined)
      const resources = [
         {type: 'service', name: 'test-svc', namespace: 'default'}
      ]
      const serviceWithoutIp = {
         spec: {type: 'LoadBalancer'},
         status: {loadBalancer: {}}
      }
      const serviceWithIp = {
         spec: {type: 'LoadBalancer'},
         status: {loadBalancer: {ingress: [{ip: '8.8.8.8'}]}}
      }

      // Arrange: Mock getResource to simulate the IP being assigned on the second poll
      const getResourceSpy = jest
         .spyOn(kc, 'getResource')
         // First call: Initial service check
         .mockResolvedValueOnce({
            stdout: JSON.stringify(serviceWithoutIp),
            stderr: '',
            exitCode: 0
         })
         // Second call: First polling iteration (no IP yet)
         .mockResolvedValueOnce({
            stdout: JSON.stringify(serviceWithoutIp),
            stderr: '',
            exitCode: 0
         })
         // Third call: Second polling iteration (IP assigned)
         .mockResolvedValueOnce({
            stdout: JSON.stringify(serviceWithIp),
            stderr: '',
            exitCode: 0
         })

      // Act
      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster
      )

      // Assert
      expect(getResourceSpy).toHaveBeenCalledTimes(3)
      expect(coreInfoSpy).toHaveBeenCalledWith(
         'ServiceExternalIP test-svc 8.8.8.8'
      )
   })

   it('should warn and describe when a service check fails', async () => {
      const resources = [
         {type: 'service', name: 'broken-svc', namespace: 'default'}
      ]
      const getServiceError = new Error('Service not found')

      // Arrange: Mock getService to fail, and describe to succeed
      // Note: We mock getResource because getService is a private helper
      const getResourceSpy = jest
         .spyOn(kc, 'getResource')
         .mockRejectedValue(getServiceError)
      const describeSpy = jest.spyOn(kc, 'describe').mockResolvedValue({
         stdout: 'describe output',
         stderr: '',
         exitCode: 0
      })

      // Act: Run the stability check. It should NOT throw an error, only warn.
      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster
      )

      // Assert
      expect(getResourceSpy).toHaveBeenCalled()
      expect(coreWarningSpy).toHaveBeenCalledWith(
         expect.stringContaining(
            `Could not determine service status of: broken-svc`
         )
      )
      expect(describeSpy).toHaveBeenCalledWith(
         'service',
         'broken-svc',
         false,
         'default'
      )
   })

   it('should not wait for an IP for a ClusterIP service', async () => {
      const resources = [
         {type: 'service', name: 'cluster-ip-svc', namespace: 'default'}
      ]
      const clusterIpService = {
         spec: {type: 'ClusterIP'}, // Not a LoadBalancer
         status: {}
      }

      // Arrange
      const getResourceSpy = jest.spyOn(kc, 'getResource').mockResolvedValue({
         stdout: JSON.stringify(clusterIpService),
         stderr: '',
         exitCode: 0
      })

      // Act
      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster
      )

      // Assert: getResource is called once to get the spec, but not again for polling.
      expect(getResourceSpy).toHaveBeenCalledTimes(1)
      expect(coreInfoSpy).not.toHaveBeenCalledWith(
         expect.stringContaining('ServiceExternalIP')
      )
   })
})

describe('checkManifestStability additional scenarios', () => {
   let kc: Kubectl
   let coreErrorSpy: jest.SpyInstance
   let coreInfoSpy: jest.SpyInstance
   let coreWarningSpy: jest.SpyInstance

   beforeEach(() => {
      kc = new Kubectl('')
      coreErrorSpy = jest.spyOn(core, 'error').mockImplementation()
      coreInfoSpy = jest.spyOn(core, 'info').mockImplementation()
      coreWarningSpy = jest.spyOn(core, 'warning').mockImplementation()
   })

   afterEach(() => {
      jest.restoreAllMocks()
   })

   it('should aggregate errors from deployment and pod failures', async () => {
      const resources = [
         {type: 'deployment', name: 'deploy-failure', namespace: 'default'},
         {type: 'pod', name: 'pod-failure', namespace: 'default'}
      ]
      const deploymentError = new Error('Deployment rollout failed')
      const podError = new Error('Pod not ready in time')

      // Arrange: Mock failures
      const checkRolloutStatusSpy = jest
         .spyOn(kc, 'checkRolloutStatus')
         .mockRejectedValue(deploymentError)
      // For pod: simulate a pod check failure
      const checkPodStatusSpy = jest
         .spyOn(manifestStabilityUtils, 'checkPodStatus')
         .mockRejectedValue(podError)
      // For both, simulate a successful describe call to provide additional details
      const describeSpy = jest.spyOn(kc, 'describe').mockResolvedValue({
         stdout: 'describe aggregated output',
         stderr: '',
         exitCode: 0
      })

      // Act & Assert:
      const expectedDeploymentError = `Rollout failed for deployment/deploy-failure in namespace default: ${deploymentError.message}`
      const expectedFullError = `Rollout status failed for the following resources:\n${expectedDeploymentError}`

      await expect(
         manifestStabilityUtils.checkManifestStability(
            kc,
            resources,
            ResourceTypeManagedCluster
         )
      ).rejects.toThrow(expectedFullError)

      // Assert that each failure was caught and processed
      expect(checkRolloutStatusSpy).toHaveBeenCalledWith(
         'deployment',
         'deploy-failure',
         'default',
         undefined
      )
      expect(checkPodStatusSpy).toHaveBeenCalledWith(kc, resources[1])
      expect(describeSpy).toHaveBeenCalled()
      expect(coreErrorSpy).toHaveBeenCalledWith(expectedDeploymentError)
   })

   it('should complete without errors when all resources are stable', async () => {
      const resources = [
         {type: 'deployment', name: 'stable-deploy', namespace: 'default'},
         {type: 'pod', name: 'stable-pod', namespace: 'default'},
         {type: 'service', name: 'stable-svc', namespace: 'default'}
      ]

      // Arrange:
      // Deployment rollout succeeds
      jest.spyOn(kc, 'checkRolloutStatus').mockResolvedValue({
         exitCode: 0,
         stderr: '',
         stdout: ''
      })
      // Pod becomes ready
      jest.spyOn(manifestStabilityUtils, 'checkPodStatus').mockResolvedValue()
      // Simulate a LoadBalancer service that already has an external IP
      const stableService = {
         spec: {type: 'LoadBalancer'},
         status: {loadBalancer: {ingress: [{ip: '1.2.3.4'}]}}
      }
      jest.spyOn(kc, 'getResource').mockResolvedValue({
         stdout: JSON.stringify(stableService),
         stderr: '',
         exitCode: 0
      })
      // Provide a describe result to avoid warnings
      jest.spyOn(kc, 'describe').mockResolvedValue({
         stdout: 'describe output stable',
         stderr: '',
         exitCode: 0
      })

      // Act & Assert:
      await expect(
         manifestStabilityUtils.checkManifestStability(
            kc,
            resources,
            ResourceTypeManagedCluster
         )
      ).resolves.not.toThrow()
   })
})

describe('getContainerErrors', () => {
   it('should return an empty string if all containers are ready', () => {
      const podStatus = {
         containerStatuses: [
            {
               name: 'app',
               ready: true,
               state: {running: {startedAt: '2025-07-18T10:00:00Z'}}
            }
         ]
      }
      expect(manifestStabilityUtils.getContainerErrors(podStatus)).toBe('')
   })

   it('should report an error for a waiting container', () => {
      const podStatus = {
         containerStatuses: [
            {
               name: 'app',
               ready: false,
               state: {
                  waiting: {
                     reason: 'ImagePullBackOff',
                     message: 'Back-off pulling image "my-image:latest"'
                  }
               }
            }
         ]
      }
      const expectedError =
         'Container issues: Container \'app\' is waiting: ImagePullBackOff - Back-off pulling image "my-image:latest"'
      expect(manifestStabilityUtils.getContainerErrors(podStatus)).toBe(
         expectedError
      )
   })

   it('should report an error for a terminated container', () => {
      const podStatus = {
         containerStatuses: [
            {
               name: 'job-runner',
               ready: false,
               state: {
                  terminated: {
                     reason: 'Error',
                     message: 'The job failed with exit code 1'
                  }
               }
            }
         ]
      }
      const expectedError =
         "Container issues: Container 'job-runner' terminated: Error - The job failed with exit code 1"
      expect(manifestStabilityUtils.getContainerErrors(podStatus)).toBe(
         expectedError
      )
   })

   it('should report an error for a waiting init container', () => {
      const podStatus = {
         initContainerStatuses: [
            {
               name: 'init-db',
               ready: false,
               state: {
                  waiting: {
                     reason: 'PodInitializing'
                  }
               }
            }
         ]
      }
      const expectedError =
         "Container issues: Init container 'init-db' is waiting: PodInitializing - No message"
      expect(manifestStabilityUtils.getContainerErrors(podStatus)).toBe(
         expectedError
      )
   })

   it('should combine errors from multiple containers', () => {
      const podStatus = {
         containerStatuses: [
            {
               name: 'main-app',
               ready: false,
               state: {waiting: {reason: 'CrashLoopBackOff'}}
            }
         ],
         initContainerStatuses: [
            {
               name: 'init-migrations',
               ready: false,
               state: {terminated: {reason: 'Error'}}
            }
         ]
      }
      const expectedError =
         "Container issues: Container 'main-app' is waiting: CrashLoopBackOff - No message; Init container 'init-migrations' terminated: Error - No message"
      expect(manifestStabilityUtils.getContainerErrors(podStatus)).toBe(
         expectedError
      )
   })
})
