import * as core from '@actions/core'
import {getManifestObjects} from './blueGreenHelper'
import {
   promoteBlueGreenIngress,
   promoteBlueGreenService,
   promoteBlueGreenSMI
} from './promote'
import {TrafficSplitObject} from '../../types/k8sObject'
import * as servicesTester from './serviceBlueGreenHelper'
import {Kubectl} from '../../types/kubectl'
import {MAX_VAL, MIN_VAL, TRAFFIC_SPLIT_OBJECT} from './smiBlueGreenHelper'
import * as smiTester from './smiBlueGreenHelper'
import * as bgHelper from './blueGreenHelper'

let testObjects
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
jest.mock('../../types/kubectl')
const kubectl = new Kubectl('')

describe('promote tests', () => {
   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()
      testObjects = getManifestObjects(ingressFilepath)
   })

   test('promote blue/green ingress', async () => {
      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.GREEN_LABEL_VALUE

      jest.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
         Promise.resolve({
            kind: 'Ingress',
            spec: {},
            metadata: {labels: mockLabels, name: 'nginx-ingress-green'}
         })
      )
      let value = await promoteBlueGreenIngress(kubectl, testObjects)

      let objects = value.objects
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
      jest.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
         Promise.resolve({
            kind: 'Ingress',
            spec: {},
            metadata: {labels: mockLabels, name: 'nginx-ingress-green'}
         })
      )

      await expect(
         promoteBlueGreenIngress(kubectl, testObjects)
      ).rejects.toThrowError()
   })

   test('promote blue/green service', async () => {
      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.GREEN_LABEL_VALUE
      jest.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
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
      jest.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
         Promise.resolve({
            kind: 'Service',
            spec: {},
            metadata: {labels: mockLabels, name: 'nginx-ingress-green'}
         })
      )
      jest
         .spyOn(servicesTester, 'validateServicesState')
         .mockImplementationOnce(() => Promise.resolve(false))

      await expect(
         promoteBlueGreenService(kubectl, testObjects)
      ).rejects.toThrowError()
   })

   test('promote blue/green SMI', async () => {
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
      jest
         .spyOn(bgHelper, 'fetchResource')
         .mockImplementation(() => Promise.resolve(mockTsObject))

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
      jest
         .spyOn(smiTester, 'validateTrafficSplitsState')
         .mockImplementation(() => Promise.resolve(false))

      expect(promoteBlueGreenSMI(kubectl, testObjects)).rejects.toThrowError()
   })
})
