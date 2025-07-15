import * as core from '@actions/core'
import {Kubectl} from '../../types/kubectl'
import {
   deployPodCanary,
   calculateReplicaCountForCanary
} from './podCanaryHelper'

jest.mock('../../types/kubectl')

const kc = new Kubectl('')

// Shared mock objects following DRY principle
const mockSuccessResult = {
   stdout: 'deployment.apps/nginx-deployment created',
   stderr: '',
   exitCode: 0
}

const mockFailureResult = {
   stdout: '',
   stderr: 'error: deployment failed',
   exitCode: 1
}

// Use existing test manifest files
const testManifestFiles = ['test/unit/manifests/basic-test.yml']

// Test constants
const VALID_PERCENTAGE = 50
const INVALID_LOW_PERCENTAGE = -10
const INVALID_HIGH_PERCENTAGE = 150
const MIN_PERCENTAGE = 0
const MAX_PERCENTAGE = 100
const TIMEOUT_300S = '300s'

describe('Pod Canary Helper tests', () => {
   let mockFilePaths: string[]
   let kubectlApplySpy: jest.SpyInstance

   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()
      jest.restoreAllMocks()

      mockFilePaths = testManifestFiles
      kubectlApplySpy = jest.spyOn(kc, 'apply')

      // Mock core.getInput with default values
      jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
         switch (name) {
            case 'percentage':
               return VALID_PERCENTAGE.toString()
            case 'force':
               return 'false'
            case 'server-side':
               return 'false'
            default:
               return ''
         }
      })
   })

   afterEach(() => {
      jest.restoreAllMocks()
      kubectlApplySpy.mockClear()
   })

   describe('deployPodCanary', () => {
      test('should deploy canary successfully when kubectl apply succeeds', async () => {
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await deployPodCanary(mockFilePaths, kc, false)

         expect(result.execResult).toEqual(mockSuccessResult)
         expect(result.manifestFiles).toBeDefined()
         expect(kubectlApplySpy).toHaveBeenCalled()
      })

      test('should throw error when kubectl apply fails', async () => {
         kubectlApplySpy.mockResolvedValue(mockFailureResult)

         await expect(
            deployPodCanary(mockFilePaths, kc, false)
         ).rejects.toThrow()
         expect(kubectlApplySpy).toHaveBeenCalledTimes(1)
      })

      test('should deploy stable only when onlyDeployStable is true', async () => {
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await deployPodCanary(mockFilePaths, kc, true)

         expect(result.execResult).toEqual(mockSuccessResult)
         expect(kubectlApplySpy).toHaveBeenCalled()
      })

      test('should handle timeout parameter', async () => {
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await deployPodCanary(
            mockFilePaths,
            kc,
            false,
            TIMEOUT_300S
         )

         expect(result.execResult).toEqual(mockSuccessResult)
         expect(kubectlApplySpy).toHaveBeenCalledWith(
            expect.any(Array),
            false,
            false,
            TIMEOUT_300S
         )
      })

      test('should throw error for invalid low percentage', async () => {
         jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            if (name === 'percentage') return INVALID_LOW_PERCENTAGE.toString()
            return ''
         })

         await expect(
            deployPodCanary(mockFilePaths, kc, false)
         ).rejects.toThrow(
            `Percentage must be between ${MIN_PERCENTAGE} and ${MAX_PERCENTAGE}`
         )
      })

      test('should throw error for invalid high percentage', async () => {
         jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            if (name === 'percentage') return INVALID_HIGH_PERCENTAGE.toString()
            return ''
         })

         await expect(
            deployPodCanary(mockFilePaths, kc, false)
         ).rejects.toThrow(
            `Percentage must be between ${MIN_PERCENTAGE} and ${MAX_PERCENTAGE}`
         )
      })

      test('should handle valid edge case percentages', async () => {
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         // Test minimum valid percentage
         jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            if (name === 'percentage') return MIN_PERCENTAGE.toString()
            return ''
         })

         const resultMin = await deployPodCanary(mockFilePaths, kc, false)
         expect(resultMin.execResult).toEqual(mockSuccessResult)

         // Test maximum valid percentage
         jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            if (name === 'percentage') return MAX_PERCENTAGE.toString()
            return ''
         })

         const resultMax = await deployPodCanary(mockFilePaths, kc, false)
         expect(resultMax.execResult).toEqual(mockSuccessResult)
      })

      test('should handle force deployment option', async () => {
         jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            switch (name) {
               case 'percentage':
                  return VALID_PERCENTAGE.toString()
               case 'force':
                  return 'true'
               default:
                  return ''
            }
         })
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await deployPodCanary(mockFilePaths, kc, false)

         expect(result.execResult).toEqual(mockSuccessResult)
         expect(kubectlApplySpy).toHaveBeenCalledWith(
            expect.any(Array),
            true, // force should be true
            false,
            undefined
         )
      })

      test('should handle server-side apply option', async () => {
         jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            switch (name) {
               case 'percentage':
                  return VALID_PERCENTAGE.toString()
               case 'server-side':
                  return 'true'
               default:
                  return ''
            }
         })
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await deployPodCanary(mockFilePaths, kc, false)

         expect(result.execResult).toEqual(mockSuccessResult)
         expect(kubectlApplySpy).toHaveBeenCalledWith(
            expect.any(Array),
            false,
            true, // server-side should be true
            undefined
         )
      })
   })

   describe('calculateReplicaCountForCanary', () => {
      test('should calculate correct replica count for given percentage', () => {
         const mockObject = {
            kind: 'Deployment',
            metadata: {
               name: 'test-deployment'
            },
            spec: {
               replicas: 10
            }
         }

         // 50% of 10 replicas = 5
         const result50 = calculateReplicaCountForCanary(mockObject, 50)
         expect(result50).toBe(5)

         // 25% of 10 replicas = 2.5, rounded to 3
         const result25 = calculateReplicaCountForCanary(mockObject, 25)
         expect(result25).toBe(3)

         // 10% of 10 replicas = 1
         const result10 = calculateReplicaCountForCanary(mockObject, 10)
         expect(result10).toBe(1)
      })

      test('should return minimum 1 replica even for very low percentages', () => {
         const mockObject = {
            kind: 'Deployment',
            metadata: {
               name: 'test-deployment'
            },
            spec: {
               replicas: 2
            }
         }

         // 1% of 2 replicas = 0.02, but should return minimum 1
         const result = calculateReplicaCountForCanary(mockObject, 1)
         expect(result).toBe(1)
      })

      test('should handle 100% percentage correctly', () => {
         const mockObject = {
            kind: 'Deployment',
            metadata: {
               name: 'test-deployment'
            },
            spec: {
               replicas: 5
            }
         }

         const result = calculateReplicaCountForCanary(mockObject, 100)
         expect(result).toBe(5)
      })

      test('should handle 0% percentage correctly', () => {
         const mockObject = {
            kind: 'Deployment',
            metadata: {
               name: 'test-deployment'
            },
            spec: {
               replicas: 10
            }
         }

         // 0% should still return minimum 1 replica
         const result = calculateReplicaCountForCanary(mockObject, 0)
         expect(result).toBe(1)
      })
   })
})
