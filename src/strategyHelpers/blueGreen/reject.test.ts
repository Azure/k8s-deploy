import {getManifestObjects} from './blueGreenHelper'
import {Kubectl} from '../../types/kubectl'

import * as TSutils from '../../utilities/trafficSplitUtils'
import {
   rejectBlueGreenIngress,
   rejectBlueGreenService,
   rejectBlueGreenSMI
} from './reject'
import * as bgHelper from './blueGreenHelper'
import * as routeHelper from './route'

const ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
const kubectl = new Kubectl('')
const TEST_TIMEOUT_SHORT = '60s'
const TEST_TIMEOUT_LONG = '120s'

jest.mock('../../types/kubectl')

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

const mockBgDeployment = {
   deployResult: {
      execResult: {stdout: '', stderr: '', exitCode: 0},
      manifestFiles: []
   },
   objects: [
      {
         kind: 'Ingress',
         metadata: {
            name: 'nginx-ingress',
            labels: new Map<string, string>()
         },
         spec: {}
      }
   ]
}

const mockDeleteResult = [
   {name: 'nginx-service-green', kind: 'Service'},
   {name: 'nginx-deployment-green', kind: 'Deployment'}
]

describe('reject tests', () => {
   let testObjects: any
   let kubectlApplySpy: jest.SpyInstance

   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()
      jest.restoreAllMocks()
      testObjects = getManifestObjects(ingressFilepath)
      kubectlApplySpy = jest.spyOn(kubectl, 'apply')
   })

   test('reject blue/green ingress', async () => {
      // Mock kubectl.apply to return successful result
      kubectlApplySpy.mockResolvedValue(mockSuccessResult)

      const value = await rejectBlueGreenIngress(kubectl, testObjects)

      const bgDeployment = value.routeResult
      const deleteResult = value.deleteResult

      expect(deleteResult).toHaveLength(2)
      for (const obj of deleteResult) {
         if (obj.kind == 'Service') {
            expect(obj.name).toBe('nginx-service-green')
         }
         if (obj.kind == 'Deployment') {
            expect(obj.name).toBe('nginx-deployment-green')
         }
      }

      expect(bgDeployment.objects).toHaveLength(1)
      expect(bgDeployment.objects[0].metadata.name).toBe('nginx-ingress')
   })

   test('reject blue/green ingress with timeout', async () => {
      // Mock routeBlueGreenIngressUnchanged and deleteGreenObjects
      jest
         .spyOn(routeHelper, 'routeBlueGreenIngressUnchanged')
         .mockResolvedValue(mockBgDeployment)

      jest
         .spyOn(bgHelper, 'deleteGreenObjects')
         .mockResolvedValue(mockDeleteResult)

      const value = await rejectBlueGreenIngress(
         kubectl,
         testObjects,
         TEST_TIMEOUT_LONG
      )

      const bgDeployment = value.routeResult
      const deleteResult = value.deleteResult

      expect(deleteResult).toHaveLength(2)
      for (const obj of deleteResult) {
         if (obj.kind === 'Service') {
            expect(obj.name).toBe('nginx-service-green')
         }
         if (obj.kind === 'Deployment') {
            expect(obj.name).toBe('nginx-deployment-green')
         }
      }

      expect(bgDeployment.objects).toHaveLength(1)
      expect(bgDeployment.objects[0].metadata.name).toBe('nginx-ingress')

      // Verify deleteGreenObjects is called with timeout
      expect(bgHelper.deleteGreenObjects).toHaveBeenCalledWith(
         kubectl,
         [].concat(
            testObjects.deploymentEntityList,
            testObjects.serviceEntityList
         ),
         TEST_TIMEOUT_LONG
      )
      expect(routeHelper.routeBlueGreenIngressUnchanged).toHaveBeenCalledWith(
         kubectl,
         testObjects.serviceNameMap,
         testObjects.ingressEntityList,
         TEST_TIMEOUT_LONG
      )
   })

   test('reject blue/green service', async () => {
      kubectlApplySpy.mockResolvedValue(mockSuccessResult)
      jest
         .spyOn(bgHelper, 'deleteGreenObjects')
         .mockResolvedValue(mockDeleteResult)

      const value = await rejectBlueGreenService(
         kubectl,
         testObjects,
         TEST_TIMEOUT_SHORT
      )

      const deleteResult = value.deleteResult

      expect(deleteResult).toHaveLength(2)
      expect(deleteResult).toContainEqual({
         name: 'nginx-service-green',
         kind: 'Service'
      })
      expect(deleteResult).toContainEqual({
         name: 'nginx-deployment-green',
         kind: 'Deployment'
      })
   })

   test('reject blue/green service with timeout', async () => {
      // Mock routeBlueGreenService and deleteGreenObjects
      jest.spyOn(routeHelper, 'routeBlueGreenService').mockResolvedValue({
         deployResult: {
            execResult: {stdout: '', stderr: '', exitCode: 0},
            manifestFiles: []
         },
         objects: [
            {
               kind: 'Service',
               metadata: {
                  name: 'nginx-service',
                  labels: new Map<string, string>()
               },
               spec: {}
            }
         ]
      })

      jest
         .spyOn(bgHelper, 'deleteGreenObjects')
         .mockResolvedValue([
            {name: 'nginx-deployment-green', kind: 'Deployment'}
         ])

      const value = await rejectBlueGreenService(
         kubectl,
         testObjects,
         TEST_TIMEOUT_LONG
      )

      const bgDeployment = value.routeResult
      const deleteResult = value.deleteResult

      // Verify deleteGreenObjects is called with timeout
      expect(bgHelper.deleteGreenObjects).toHaveBeenCalledWith(
         kubectl,
         testObjects.deploymentEntityList,
         TEST_TIMEOUT_LONG
      )

      // Assertions for routeResult and deleteResult
      expect(deleteResult).toHaveLength(1)
      expect(deleteResult[0].name).toBe('nginx-deployment-green')
      expect(bgDeployment.objects).toHaveLength(1)
      expect(bgDeployment.objects[0].metadata.name).toBe('nginx-service')
   })

   test('reject blue/green SMI', async () => {
      // Mock kubectl.apply to return successful result
      kubectlApplySpy.mockResolvedValue(mockSuccessResult)

      jest
         .spyOn(TSutils, 'getTrafficSplitAPIVersion')
         .mockImplementation(() => Promise.resolve('v1alpha3'))
      const rejectResult = await rejectBlueGreenSMI(kubectl, testObjects)
      expect(rejectResult.deleteResult).toHaveLength(2)
   })

   // Consolidated error tests
   test.each([
      {
         name: 'should throw error when kubectl apply fails during blue/green ingress rejection',
         fn: () => rejectBlueGreenIngress(kubectl, testObjects),
         setup: () => {
            jest
               .spyOn(bgHelper, 'deleteGreenObjects')
               .mockResolvedValue(mockDeleteResult)
         }
      },
      {
         name: 'should throw error when kubectl apply fails during blue/green service rejection',
         fn: () => rejectBlueGreenService(kubectl, testObjects),
         setup: () => {
            jest
               .spyOn(bgHelper, 'deleteGreenObjects')
               .mockResolvedValue(mockDeleteResult)
         }
      },
      {
         name: 'should throw error when kubectl apply fails during blue/green SMI rejection',
         fn: () => rejectBlueGreenSMI(kubectl, testObjects),
         setup: () => {
            jest
               .spyOn(TSutils, 'getTrafficSplitAPIVersion')
               .mockImplementation(() => Promise.resolve('v1alpha3'))
         }
      }
   ])('$name', async ({fn, setup}) => {
      kubectlApplySpy.mockClear()
      kubectlApplySpy.mockResolvedValue(mockFailureResult)
      setup()

      await expect(fn()).rejects.toThrow()
      const timeoutArg = kubectlApplySpy.mock.calls[0][3]
      expect(typeof timeoutArg === 'string' || timeoutArg === undefined).toBe(
         true
      )

      expect(kubectlApplySpy).toHaveBeenCalledWith(
         expect.any(Array),
         expect.any(Boolean),
         expect.any(Boolean),
         timeoutArg
      )
      expect(kubectlApplySpy).toHaveBeenCalledTimes(1)
   })
})
