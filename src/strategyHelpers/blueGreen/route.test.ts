import {vi} from 'vitest'
import type {MockInstance} from 'vitest'
import {K8sIngress, TrafficSplitObject} from '../../types/k8sObject.js'
import {Kubectl} from '../../types/kubectl.js'
import * as fileHelper from '../../utilities/fileUtils.js'
import * as TSutils from '../../utilities/trafficSplitUtils.js'
import {RouteStrategy} from '../../types/routeStrategy.js'
import {BlueGreenManifests} from '../../types/blueGreenTypes.js'

import {
   BLUE_GREEN_VERSION_LABEL,
   getManifestObjects,
   GREEN_LABEL_VALUE
} from './blueGreenHelper.js'
import * as bgHelper from './blueGreenHelper.js'
import * as smiHelper from './smiBlueGreenHelper.js'
import {
   routeBlueGreenIngress,
   routeBlueGreenService,
   routeBlueGreenForDeploy,
   routeBlueGreenSMI,
   routeBlueGreenIngressUnchanged
} from './route.js'

vi.mock('../../types/kubectl')
const ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
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

describe('route function tests', () => {
   let testObjects: BlueGreenManifests
   let kubectlApplySpy: MockInstance

   beforeEach(() => {
      vi.mocked(Kubectl).mockClear()
      testObjects = getManifestObjects(ingressFilepath)
      kubectlApplySpy = vi.spyOn(kc, 'apply')
      vi.spyOn(fileHelper, 'writeObjectsToFile').mockImplementationOnce(() => [
         ''
      ])
   })

   test('correctly prepares blue/green ingresses for deployment', async () => {
      kubectlApplySpy.mockResolvedValue(mockSuccessResult)

      const unroutedIngCopy: K8sIngress = JSON.parse(
         JSON.stringify(testObjects.ingressEntityList[0])
      )
      unroutedIngCopy.metadata.name = 'nginx-ingress-unrouted'
      unroutedIngCopy.spec.rules[0].http.paths[0].backend.service.name =
         'fake-service'
      testObjects.ingressEntityList.push(unroutedIngCopy)
      const value = await routeBlueGreenIngress(
         kc,
         testObjects.serviceNameMap,
         testObjects.ingressEntityList
      )

      expect(value.objects).toHaveLength(2)
      expect(value.objects[0].metadata.name).toBe('nginx-ingress')
      expect(
         (value.objects[0] as K8sIngress).spec.rules[0].http.paths[0].backend
            .service.name
      ).toBe('nginx-service-green')

      expect(value.objects[1].metadata.name).toBe('nginx-ingress-unrouted')
      // unrouted services shouldn't get their service name changed
      expect(
         (value.objects[1] as K8sIngress).spec.rules[0].http.paths[0].backend
            .service.name
      ).toBe('fake-service')
   })

   test('correctly prepares blue/green services for deployment', async () => {
      const value = await routeBlueGreenService(
         kc,
         GREEN_LABEL_VALUE,
         testObjects.serviceEntityList
      )

      expect(value.objects).toHaveLength(1)
      expect(value.objects[0].metadata.name).toBe('nginx-service')

      expect(value.objects[0].metadata.labels[BLUE_GREEN_VERSION_LABEL]).toBe(
         GREEN_LABEL_VALUE
      )
   })

   test('correctly identifies route pattern and acts accordingly', async () => {
      vi.spyOn(TSutils, 'getTrafficSplitAPIVersion').mockImplementation(() =>
         Promise.resolve('v1alpha3')
      )

      const ingressResult = await routeBlueGreenForDeploy(
         kc,
         ingressFilepath,
         RouteStrategy.INGRESS
      )

      expect(ingressResult.objects.length).toBe(1)
      expect(ingressResult.objects[0].metadata.name).toBe('nginx-ingress')

      const serviceResult = await routeBlueGreenForDeploy(
         kc,
         ingressFilepath,
         RouteStrategy.SERVICE
      )

      expect(serviceResult.objects.length).toBe(1)
      expect(serviceResult.objects[0].metadata.name).toBe('nginx-service')

      const smiResult = await routeBlueGreenForDeploy(
         kc,
         ingressFilepath,
         RouteStrategy.SMI
      )

      expect(smiResult.objects).toHaveLength(1)
      expect(smiResult.objects[0].metadata.name).toBe(
         'nginx-service-trafficsplit'
      )
      expect(
         (smiResult.objects as TrafficSplitObject[])[0].spec.backends
      ).toHaveLength(2)
   })

   // Consolidated error tests
   test.each([
      {
         name: 'should throw error when kubectl apply fails during blue/green ingress routing',
         fn: () =>
            routeBlueGreenIngress(
               kc,
               testObjects.serviceNameMap,
               testObjects.ingressEntityList
            ),
         setup: () => {}
      },
      {
         name: 'should throw error when kubectl apply fails during blue/green service routing',
         fn: () =>
            routeBlueGreenService(
               kc,
               GREEN_LABEL_VALUE,
               testObjects.serviceEntityList
            ),
         setup: () => {}
      },
      {
         name: 'should throw error when kubectl apply fails during blue/green SMI routing',
         fn: () =>
            routeBlueGreenSMI(
               kc,
               GREEN_LABEL_VALUE,
               testObjects.serviceEntityList
            ),
         setup: () => {
            vi.spyOn(TSutils, 'getTrafficSplitAPIVersion').mockImplementation(
               () => Promise.resolve('v1alpha3')
            )
         }
      },
      {
         name: 'should throw error when kubectl apply fails during blue/green ingress unchanged routing',
         fn: () =>
            routeBlueGreenIngressUnchanged(
               kc,
               testObjects.serviceNameMap,
               testObjects.ingressEntityList
            ),
         setup: () => {}
      }
   ])('$name', async ({fn, setup}) => {
      kubectlApplySpy.mockClear()
      kubectlApplySpy.mockResolvedValue(mockFailureResult)
      setup()

      await expect(fn()).rejects.toThrow()
      expect(kubectlApplySpy).toHaveBeenCalledTimes(1)
   })
})

// Timeout tests
describe('route timeout tests', () => {
   let testObjects: BlueGreenManifests

   beforeEach(() => {
      vi.mocked(Kubectl).mockClear()
      testObjects = getManifestObjects(ingressFilepath)
      vi.spyOn(fileHelper, 'writeObjectsToFile').mockImplementationOnce(() => [
         ''
      ])
   })

   afterEach(() => {
      vi.restoreAllMocks()
   })

   test('routeBlueGreenService with timeout', async () => {
      const timeout = '240s'

      // Mock deployObjects to capture timeout parameter
      const deployObjectsSpy = vi
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue({
            execResult: mockSuccessResult,
            manifestFiles: []
         })

      const value = await routeBlueGreenService(
         kc,
         GREEN_LABEL_VALUE,
         testObjects.serviceEntityList,
         timeout
      )

      expect(deployObjectsSpy).toHaveBeenCalledWith(
         kc,
         expect.any(Array),
         timeout
      )
      expect(value.objects).toHaveLength(1)

      deployObjectsSpy.mockRestore()
   })

   test('routeBlueGreenSMI with timeout', async () => {
      const timeout = '300s'

      vi.spyOn(TSutils, 'getTrafficSplitAPIVersion').mockImplementation(() =>
         Promise.resolve('v1alpha3')
      )

      // Mock deployObjects and createTrafficSplitObject to capture timeout parameter
      const deployObjectsSpy = vi
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue({
            execResult: mockSuccessResult,
            manifestFiles: []
         })

      const createTrafficSplitSpy = vi
         .spyOn(smiHelper, 'createTrafficSplitObject')
         .mockResolvedValue({
            apiVersion: 'split.smi-spec.io/v1alpha3',
            kind: 'TrafficSplit',
            metadata: {
               name: 'nginx-service-trafficsplit',
               labels: new Map(),
               annotations: new Map()
            },
            spec: {service: 'nginx-service', backends: []}
         })

      const value = await routeBlueGreenSMI(
         kc,
         GREEN_LABEL_VALUE,
         testObjects.serviceEntityList,
         timeout
      )

      expect(createTrafficSplitSpy).toHaveBeenCalledWith(
         kc,
         'nginx-service',
         GREEN_LABEL_VALUE,
         timeout
      )
      expect(deployObjectsSpy).toHaveBeenCalledWith(
         kc,
         expect.any(Array),
         timeout
      )
      expect(value.objects).toHaveLength(1)

      deployObjectsSpy.mockRestore()
      createTrafficSplitSpy.mockRestore()
   })

   test('routeBlueGreenIngressUnchanged with timeout', async () => {
      const timeout = '180s'

      // Mock deployObjects to capture timeout parameter
      const deployObjectsSpy = vi
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue({
            execResult: mockSuccessResult,
            manifestFiles: []
         })

      const value = await routeBlueGreenIngressUnchanged(
         kc,
         testObjects.serviceNameMap,
         testObjects.ingressEntityList,
         timeout
      )

      expect(deployObjectsSpy).toHaveBeenCalledWith(
         kc,
         expect.any(Array),
         timeout
      )
      expect(value.objects).toHaveLength(1)

      deployObjectsSpy.mockRestore()
   })

   test('route functions without timeout should pass undefined', async () => {
      const deployObjectsSpy = vi
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue({
            execResult: mockSuccessResult,
            manifestFiles: []
         })

      // Test routeBlueGreenService without timeout
      await routeBlueGreenService(
         kc,
         GREEN_LABEL_VALUE,
         testObjects.serviceEntityList
      )

      expect(deployObjectsSpy).toHaveBeenCalledWith(
         kc,
         expect.any(Array),
         undefined
      )

      deployObjectsSpy.mockRestore()
   })
})
