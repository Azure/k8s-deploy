import * as core from '@actions/core'
import {TrafficSplitObject} from '../../types/k8sObject'
import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import * as TSutils from '../../utilities/trafficSplitUtils'

import {BlueGreenManifests} from '../../types/blueGreenTypes'
import {
   BLUE_GREEN_VERSION_LABEL,
   getManifestObjects,
   GREEN_LABEL_VALUE,
   NONE_LABEL_VALUE
} from './blueGreenHelper'

import {
   cleanupSMI,
   createTrafficSplitObject,
   getGreenSMIServiceResource,
   getStableSMIServiceResource,
   MAX_VAL,
   MIN_VAL,
   setupSMI,
   TRAFFIC_SPLIT_OBJECT,
   TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX,
   validateTrafficSplitsState
} from './smiBlueGreenHelper'
import * as bgHelper from './blueGreenHelper'

jest.mock('../../types/kubectl')

const kc = new Kubectl('')
const ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
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

describe('SMI Helper tests', () => {
   let testObjects: BlueGreenManifests
   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()

      jest
         .spyOn(TSutils, 'getTrafficSplitAPIVersion')
         .mockImplementation(() => Promise.resolve(''))

      testObjects = getManifestObjects(ingressFilepath)
      jest
         .spyOn(fileHelper, 'writeObjectsToFile')
         .mockImplementationOnce(() => [''])
   })

   test('setupSMI tests', async () => {
      const smiResults = await setupSMI(kc, testObjects.serviceEntityList)

      let found = 0
      for (const obj of smiResults.objects) {
         if (obj.metadata.name === 'nginx-service-stable') {
            expect(obj.metadata.labels[BLUE_GREEN_VERSION_LABEL]).toBe(
               NONE_LABEL_VALUE
            )
            expect(obj.spec.selector.app).toBe('nginx')
            found++
         }

         if (obj.metadata.name === 'nginx-service-green') {
            expect(obj.metadata.labels[BLUE_GREEN_VERSION_LABEL]).toBe(
               GREEN_LABEL_VALUE
            )
            found++
         }

         if (obj.metadata.name === 'nginx-service-trafficsplit') {
            found++
            // expect stable weight to be max val
            const casted = obj as TrafficSplitObject
            expect(casted.spec.backends).toHaveLength(2)
            for (const be of casted.spec.backends) {
               if (be.service === 'nginx-service-stable') {
                  expect(be.weight).toBe(MAX_VAL)
               }
               if (be.service === 'nginx-service-green') {
                  expect(be.weight).toBe(MIN_VAL)
               }
            }
         }
      }

      expect(found).toBe(3)
   })

   test('createTrafficSplitObject tests', async () => {
      const noneTsObject: TrafficSplitObject = await createTrafficSplitObject(
         kc,
         testObjects.serviceEntityList[0].metadata.name,
         NONE_LABEL_VALUE
      )
      expect(noneTsObject.metadata.name).toBe('nginx-service-trafficsplit')
      for (let be of noneTsObject.spec.backends) {
         if (be.service === 'nginx-service-stable') {
            expect(be.weight).toBe(MAX_VAL)
         }
         if (be.service === 'nginx-service-green') {
            expect(be.weight).toBe(MIN_VAL)
         }
      }

      const greenTsObject: TrafficSplitObject = await createTrafficSplitObject(
         kc,
         testObjects.serviceEntityList[0].metadata.name,
         GREEN_LABEL_VALUE
      )
      expect(greenTsObject.metadata.name).toBe('nginx-service-trafficsplit')
      for (const be of greenTsObject.spec.backends) {
         if (be.service === 'nginx-service-stable') {
            expect(be.weight).toBe(MIN_VAL)
         }
         if (be.service === 'nginx-service-green') {
            expect(be.weight).toBe(MAX_VAL)
         }
      }
   })

   test('getSMIServiceResource test', () => {
      const stableResult = getStableSMIServiceResource(
         testObjects.serviceEntityList[0]
      )
      const greenResult = getGreenSMIServiceResource(
         testObjects.serviceEntityList[0]
      )

      expect(stableResult.metadata.name).toBe('nginx-service-stable')
      expect(stableResult.metadata.labels[BLUE_GREEN_VERSION_LABEL]).toBe(
         NONE_LABEL_VALUE
      )

      expect(greenResult.metadata.name).toBe('nginx-service-green')
      expect(greenResult.metadata.labels[BLUE_GREEN_VERSION_LABEL]).toBe(
         GREEN_LABEL_VALUE
      )
   })

   test('validateTrafficSplitsState', async () => {
      jest
         .spyOn(bgHelper, 'fetchResource')
         .mockImplementation(() => Promise.resolve(mockTsObject))

      let valResult = await validateTrafficSplitsState(
         kc,
         testObjects.serviceEntityList
      )

      expect(valResult).toBe(true)

      const mockTsCopy = JSON.parse(JSON.stringify(mockTsObject))
      mockTsCopy.spec.backends[0].weight = MAX_VAL
      jest
         .spyOn(bgHelper, 'fetchResource')
         .mockImplementation(() => Promise.resolve(mockTsCopy))

      valResult = await validateTrafficSplitsState(
         kc,
         testObjects.serviceEntityList
      )
      expect(valResult).toBe(false)

      jest.spyOn(bgHelper, 'fetchResource').mockImplementation()
      valResult = await validateTrafficSplitsState(
         kc,
         testObjects.serviceEntityList
      )
      expect(valResult).toBe(false)
   })

   test('cleanupSMI test', async () => {
      const deleteObjects = await cleanupSMI(kc, testObjects.serviceEntityList)
      expect(deleteObjects).toHaveLength(1)
      expect(deleteObjects[0].name).toBe('nginx-service-green')
      expect(deleteObjects[0].kind).toBe('Service')
   })
})
