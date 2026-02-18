import {vi} from 'vitest'
import type {MockInstance} from 'vitest'
import {getManifestObjects} from './blueGreenHelper.js'
import {
   promoteBlueGreenIngress,
   promoteBlueGreenService,
   promoteBlueGreenSMI
} from './promote.js'
import {TrafficSplitObject} from '../../types/k8sObject.js'
import * as servicesTester from './serviceBlueGreenHelper.js'
import {Kubectl} from '../../types/kubectl.js'
import {MAX_VAL, MIN_VAL, TRAFFIC_SPLIT_OBJECT} from './smiBlueGreenHelper.js'
import * as smiTester from './smiBlueGreenHelper.js'
import * as bgHelper from './blueGreenHelper.js'
import {ExecOutput} from '@actions/exec'

const ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']

vi.mock('../../types/kubectl')

// Shared variables used across all test suites
let testObjects: any
const kubectl = new Kubectl('')

// Shared mock objects following DRY principle
const mockSuccessResult: ExecOutput = {
   stdout: 'deployment.apps/nginx-deployment created',
   stderr: '',
   exitCode: 0
}

const mockFailureResult: ExecOutput = {
   stdout: '',
   stderr: 'error: deployment failed',
   exitCode: 1
}

const mockBgDeployment = {
   deployResult: {
      execResult: {exitCode: 0, stderr: '', stdout: ''},
      manifestFiles: []
   },
   objects: []
}

describe('promote tests', () => {
   let kubectlApplySpy: MockInstance

   beforeEach(() => {
      vi.mocked(Kubectl).mockClear()
      testObjects = getManifestObjects(ingressFilepath)
      kubectlApplySpy = vi.spyOn(kubectl, 'apply')
   })

   test('promote blue/green ingress', async () => {
      kubectlApplySpy.mockResolvedValue(mockSuccessResult)

      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.GREEN_LABEL_VALUE

      vi.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
         Promise.resolve({
            kind: 'Ingress',
            spec: {},
            metadata: {labels: mockLabels, name: 'nginx-ingress-green'}
         })
      )
      const value = await promoteBlueGreenIngress(kubectl, testObjects)

      const objects = value.objects
      expect(objects).toHaveLength(2)

      for (const obj of objects) {
         if (obj.kind === 'Service') {
            expect(obj.metadata.name).toBe('nginx-service')
         } else if (obj.kind == 'Deployment') {
            expect(obj.metadata.name).toBe('nginx-deployment')
         }
         expect(obj.metadata.labels['k8s.deploy.color']).toBe('None')
      }
   })

   test('fail to promote invalid blue/green ingress', async () => {
      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.NONE_LABEL_VALUE
      vi.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
         Promise.resolve({
            kind: 'Ingress',
            spec: {},
            metadata: {labels: mockLabels, name: 'nginx-ingress-green'}
         })
      )

      await expect(
         promoteBlueGreenIngress(kubectl, testObjects)
      ).rejects.toThrow()
   })

   test('promote blue/green service', async () => {
      kubectlApplySpy.mockResolvedValue(mockSuccessResult)

      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.GREEN_LABEL_VALUE
      vi.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
         Promise.resolve({
            kind: 'Service',
            spec: {selector: mockLabels},
            metadata: {labels: mockLabels, name: 'nginx-service-green'}
         })
      )

      let value = await promoteBlueGreenService(kubectl, testObjects)

      expect(value.objects).toHaveLength(1)
      expect(
         value.objects[0].metadata.labels[bgHelper.BLUE_GREEN_VERSION_LABEL]
      ).toBe(bgHelper.NONE_LABEL_VALUE)
      expect(value.objects[0].metadata.name).toBe('nginx-deployment')
   })

   test('fail to promote invalid blue/green service', async () => {
      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.NONE_LABEL_VALUE
      vi.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
         Promise.resolve({
            kind: 'Service',
            spec: {},
            metadata: {labels: mockLabels, name: 'nginx-ingress-green'}
         })
      )
      vi.spyOn(servicesTester, 'validateServicesState').mockImplementationOnce(
         () => Promise.resolve(false)
      )

      await expect(
         promoteBlueGreenService(kubectl, testObjects)
      ).rejects.toThrow()
   })

   test('promote blue/green SMI', async () => {
      kubectlApplySpy.mockResolvedValue(mockSuccessResult)

      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.NONE_LABEL_VALUE

      const mockTsObject: TrafficSplitObject = {
         apiVersion: 'v1alpha3',
         kind: TRAFFIC_SPLIT_OBJECT,
         metadata: {
            name: 'nginx-service-trafficsplit',
            labels: new Map<string, string>(),
            annotations: new Map<string, string>()
         },
         spec: {
            service: 'nginx-service',
            backends: [
               {
                  service: 'nginx-service-stable',
                  weight: MIN_VAL
               },
               {
                  service: 'nginx-service-green',
                  weight: MAX_VAL
               }
            ]
         }
      }
      vi.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
         Promise.resolve(mockTsObject)
      )

      const deployResult = await promoteBlueGreenSMI(kubectl, testObjects)

      expect(deployResult.objects).toHaveLength(1)
      expect(deployResult.objects[0].metadata.name).toBe('nginx-deployment')
      expect(
         deployResult.objects[0].metadata.labels[
            bgHelper.BLUE_GREEN_VERSION_LABEL
         ]
      ).toBe(bgHelper.NONE_LABEL_VALUE)
   })

   test('promote blue/green SMI with bad trafficsplit', async () => {
      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.NONE_LABEL_VALUE
      vi.spyOn(smiTester, 'validateTrafficSplitsState').mockImplementation(() =>
         Promise.resolve(false)
      )

      await expect(promoteBlueGreenSMI(kubectl, testObjects)).rejects.toThrow()
   })

   // Consolidated error tests
   test.each([
      {
         name: 'should throw error when kubectl apply fails during blue/green ingress promotion',
         fn: () => promoteBlueGreenIngress(kubectl, testObjects),
         setup: () => {
            const mockLabels = new Map<string, string>()
            mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] =
               bgHelper.GREEN_LABEL_VALUE
            vi.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
               Promise.resolve({
                  kind: 'Ingress',
                  spec: {},
                  metadata: {labels: mockLabels, name: 'nginx-ingress-green'}
               })
            )
         }
      },
      {
         name: 'should throw error when kubectl apply fails during blue/green service promotion',
         fn: () => promoteBlueGreenService(kubectl, testObjects),
         setup: () => {
            const mockLabels = new Map<string, string>()
            mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] =
               bgHelper.GREEN_LABEL_VALUE
            vi.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
               Promise.resolve({
                  kind: 'Service',
                  spec: {selector: mockLabels},
                  metadata: {labels: mockLabels, name: 'nginx-service-green'}
               })
            )
            vi.spyOn(servicesTester, 'validateServicesState').mockResolvedValue(
               true
            )
         }
      },
      {
         name: 'should throw error when kubectl apply fails during blue/green SMI promotion',
         fn: () => promoteBlueGreenSMI(kubectl, testObjects),
         setup: () => {
            const mockTsObject: TrafficSplitObject = {
               apiVersion: 'v1alpha3',
               kind: TRAFFIC_SPLIT_OBJECT,
               metadata: {
                  name: 'nginx-service-trafficsplit',
                  labels: new Map<string, string>(),
                  annotations: new Map<string, string>()
               },
               spec: {
                  service: 'nginx-service',
                  backends: [
                     {service: 'nginx-service-stable', weight: MIN_VAL},
                     {service: 'nginx-service-green', weight: MAX_VAL}
                  ]
               }
            }
            vi.spyOn(bgHelper, 'fetchResource').mockResolvedValue(mockTsObject)
            vi.spyOn(smiTester, 'validateTrafficSplitsState').mockResolvedValue(
               true
            )
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

// Timeout tests
describe('promote timeout tests', () => {
   beforeEach(() => {
      vi.mocked(Kubectl).mockClear()
      testObjects = getManifestObjects(ingressFilepath)
   })

   const mockDeployWithLabel = () =>
      vi.spyOn(bgHelper, 'deployWithLabel').mockResolvedValue(mockBgDeployment)

   const setupFetchResource = (
      kind: string,
      name: string,
      labelValue: string
   ) => {
      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = labelValue

      vi.spyOn(bgHelper, 'fetchResource').mockResolvedValue({
         kind,
         spec: {},
         metadata: {labels: mockLabels, name}
      })
   }

   test.each([
      {
         name: 'promoteBlueGreenIngress with timeout',
         fn: promoteBlueGreenIngress,
         kind: 'Ingress',
         resourceName: 'nginx-ingress-green',
         timeout: '300s',
         setup: () =>
            setupFetchResource(
               'Ingress',
               'nginx-ingress-green',
               bgHelper.GREEN_LABEL_VALUE
            )
      },
      {
         name: 'promoteBlueGreenService with timeout',
         fn: promoteBlueGreenService,
         kind: 'Service',
         resourceName: 'nginx-service-green',
         timeout: '240s',
         setup: () => {
            setupFetchResource(
               'Service',
               'nginx-service-green',
               bgHelper.GREEN_LABEL_VALUE
            )
            vi.spyOn(servicesTester, 'validateServicesState').mockResolvedValue(
               true
            )
         }
      },
      {
         name: 'promoteBlueGreenSMI with timeout',
         fn: promoteBlueGreenSMI,
         kind: 'TrafficSplit',
         resourceName: 'nginx-service-trafficsplit',
         timeout: '180s',
         setup: () => {
            const mockTsObject: TrafficSplitObject = {
               apiVersion: 'v1alpha3',
               kind: TRAFFIC_SPLIT_OBJECT,
               metadata: {
                  name: 'nginx-service-trafficsplit',
                  labels: new Map<string, string>(),
                  annotations: new Map<string, string>()
               },
               spec: {
                  service: 'nginx-service',
                  backends: [
                     {service: 'nginx-service-stable', weight: MIN_VAL},
                     {service: 'nginx-service-green', weight: MAX_VAL}
                  ]
               }
            }

            vi.spyOn(bgHelper, 'fetchResource').mockResolvedValue(mockTsObject)
            vi.spyOn(smiTester, 'validateTrafficSplitsState').mockResolvedValue(
               true
            )
         }
      }
   ])('$name', async ({fn, timeout, setup}) => {
      setup()
      const deployWithLabelSpy = mockDeployWithLabel()

      await fn(kubectl, testObjects, timeout)

      expect(deployWithLabelSpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         bgHelper.NONE_LABEL_VALUE,
         timeout
      )

      deployWithLabelSpy.mockRestore()
   })

   test('promote functions without timeout should pass undefined', async () => {
      setupFetchResource(
         'Ingress',
         'nginx-ingress-green',
         bgHelper.GREEN_LABEL_VALUE
      )
      const deployWithLabelSpy = mockDeployWithLabel()

      await promoteBlueGreenIngress(kubectl, testObjects)

      expect(deployWithLabelSpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         bgHelper.NONE_LABEL_VALUE,
         undefined
      )

      deployWithLabelSpy.mockRestore()
   })
})
