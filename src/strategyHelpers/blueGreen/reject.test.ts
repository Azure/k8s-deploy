import {getManifestObjects} from './blueGreenHelper'
import {Kubectl} from '../../types/kubectl'
import {BlueGreenRejectResult} from '../../types/blueGreenTypes'

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

jest.mock('../../types/kubectl')

describe('reject tests', () => {
   let testObjects

   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()
      testObjects = getManifestObjects(ingressFilepath)
   })

   test('reject blue/green ingress', async () => {
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
         .mockResolvedValue({
            deployResult: {},
            objects: [{metadata: {name: 'nginx-ingress'}}]
         })

      jest.spyOn(bgHelper, 'deleteGreenObjects').mockResolvedValue([
         {name: 'nginx-service-green', kind: 'Service'},
         {name: 'nginx-deployment-green', kind: 'Deployment'}
      ])

      const value = await rejectBlueGreenIngress(kubectl, testObjects, '120s')

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
         '120s'
      )
      expect(routeHelper.routeBlueGreenIngressUnchanged).toHaveBeenCalledWith(
         kubectl,
         testObjects.serviceNameMap,
         testObjects.ingressEntityList,
         '120s'
      )
   })

   test('reject blue/green service', async () => {
      jest.spyOn(bgHelper, 'deleteGreenObjects').mockResolvedValue([
         {name: 'nginx-service-green', kind: 'Service'},
         {name: 'nginx-deployment-green', kind: 'Deployment'}
      ])

      const value = await rejectBlueGreenService(kubectl, testObjects, '60s')

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
         deployResult: {},
         objects: [{metadata: {name: 'nginx-service'}}]
      })

      jest
         .spyOn(bgHelper, 'deleteGreenObjects')
         .mockResolvedValue([
            {name: 'nginx-deployment-green', kind: 'Deployment'}
         ])

      const value = await rejectBlueGreenService(kubectl, testObjects, '120s')

      const bgDeployment = value.routeResult
      const deleteResult = value.deleteResult

      // Verify deleteGreenObjects is called with timeout
      expect(bgHelper.deleteGreenObjects).toHaveBeenCalledWith(
         kubectl,
         testObjects.deploymentEntityList,
         '120s'
      )

      // Assertions for routeResult and deleteResult
      expect(deleteResult).toHaveLength(1)
      expect(deleteResult[0].name).toBe('nginx-deployment-green')

      expect(bgDeployment.objects).toHaveLength(1)
      expect(bgDeployment.objects[0].metadata.name).toBe('nginx-service')
   })

   test('reject blue/green SMI', async () => {
      jest
         .spyOn(TSutils, 'getTrafficSplitAPIVersion')
         .mockImplementation(() => Promise.resolve('v1alpha3'))
      const rejectResult = await rejectBlueGreenSMI(kubectl, testObjects)
      expect(rejectResult.deleteResult).toHaveLength(2)
   })
})
