import * as core from '@actions/core'
import * as fs from 'fs'
import {Kubectl} from '../../types/kubectl'
import {
   deploySMICanary,
   redirectTrafficToCanaryDeployment,
   redirectTrafficToStableDeployment
} from './smiCanaryHelper'

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

const mockExecuteCommandResult = {
   stdout: 'split.smi-spec.io/v1alpha1\nsplit.smi-spec.io/v1alpha2',
   stderr: '',
   exitCode: 0
}

// Use existing test manifest files
const testManifestFiles = ['test/unit/manifests/basic-test.yml']

// Test constants
const VALID_REPLICA_COUNT = 5
const TIMEOUT_300S = '300s'
const TIMEOUT_240S = '240s'

describe('SMI Canary Helper tests', () => {
   let mockFilePaths: string[]
   let kubectlApplySpy: jest.SpyInstance
   let kubectlExecuteCommandSpy: jest.SpyInstance

   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()
      jest.restoreAllMocks()

      mockFilePaths = testManifestFiles
      kubectlApplySpy = jest.spyOn(kc, 'apply')
      kubectlExecuteCommandSpy = jest
         .spyOn(kc, 'executeCommand')
         .mockResolvedValue(mockExecuteCommandResult)

      // Mock core.getInput with default values
      jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
         switch (name) {
            case 'percentage':
               return '50'
            case 'baseline-and-canary-replicas':
               return ''
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

   describe('deploySMICanary', () => {
      test('should deploy canary successfully when kubectl apply succeeds', async () => {
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await deploySMICanary(mockFilePaths, kc, false)

         expect(result.execResult).toEqual(mockSuccessResult)
         expect(result.manifestFiles).toBeDefined()
         expect(kubectlApplySpy).toHaveBeenCalled()
      })

      test('should throw error when kubectl apply fails', async () => {
         kubectlApplySpy.mockResolvedValue(mockFailureResult)

         await expect(
            deploySMICanary(mockFilePaths, kc, false)
         ).rejects.toThrow()
      })

      test('should deploy stable only when onlyDeployStable is true', async () => {
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await deploySMICanary(mockFilePaths, kc, true)

         expect(result.execResult).toEqual(mockSuccessResult)
         expect(kubectlApplySpy).toHaveBeenCalled()
      })

      test('should handle custom replica count from input', async () => {
         jest.spyOn(core, 'getInput').mockImplementation((name: string) => {
            switch (name) {
               case 'baseline-and-canary-replicas':
                  return VALID_REPLICA_COUNT.toString()
               case 'percentage':
                  return '50'
               default:
                  return ''
            }
         })
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await deploySMICanary(mockFilePaths, kc, false)

         expect(result.execResult).toEqual(mockSuccessResult)
      })
   })

   describe('redirectTrafficToCanaryDeployment', () => {
      test('should redirect traffic to canary deployment successfully', async () => {
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         await redirectTrafficToCanaryDeployment(kc, mockFilePaths)

         expect(kubectlApplySpy).toHaveBeenCalled()
      })

      test('should handle timeout parameter', async () => {
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         await redirectTrafficToCanaryDeployment(
            kc,
            mockFilePaths,
            TIMEOUT_300S
         )

         expect(kubectlApplySpy).toHaveBeenCalledWith(
            expect.any(Array),
            false,
            false,
            TIMEOUT_300S
         )
      })

      test('should throw error when kubectl apply fails', async () => {
         kubectlApplySpy.mockResolvedValue(mockFailureResult)

         await expect(
            redirectTrafficToCanaryDeployment(kc, mockFilePaths)
         ).rejects.toThrow()
      })
   })

   describe('redirectTrafficToStableDeployment', () => {
      test('should redirect traffic to stable deployment successfully', async () => {
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await redirectTrafficToStableDeployment(
            kc,
            mockFilePaths
         )

         expect(result).toBeDefined()
         expect(kubectlApplySpy).toHaveBeenCalled()
      })

      test('should handle timeout parameter', async () => {
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await redirectTrafficToStableDeployment(
            kc,
            mockFilePaths,
            TIMEOUT_240S
         )

         expect(result).toBeDefined()
         expect(kubectlApplySpy).toHaveBeenCalledWith(
            expect.any(Array),
            false,
            false,
            TIMEOUT_240S
         )
      })

      test('should throw error when kubectl apply fails', async () => {
         kubectlApplySpy.mockResolvedValue(mockFailureResult)

         await expect(
            redirectTrafficToStableDeployment(kc, mockFilePaths)
         ).rejects.toThrow()
      })
   })

   // Consolidated error tests
   test.each([
      {
         name: 'should throw error when kubectl apply fails during SMI canary deployment',
         fn: () => deploySMICanary(mockFilePaths, kc, false),
         expectedCalls: 2
      },
      {
         name: 'should throw error when kubectl apply fails during traffic redirect to canary',
         fn: () => redirectTrafficToCanaryDeployment(kc, mockFilePaths),
         expectedCalls: 1
      },
      {
         name: 'should throw error when kubectl apply fails during traffic redirect to stable',
         fn: () => redirectTrafficToStableDeployment(kc, mockFilePaths),
         expectedCalls: 1
      }
   ])('$name', async ({fn, expectedCalls}) => {
      kubectlApplySpy.mockClear()
      kubectlApplySpy.mockResolvedValue(mockFailureResult)

      await expect(fn()).rejects.toThrow()
      expect(kubectlApplySpy).toHaveBeenCalledTimes(expectedCalls)
   })
})
