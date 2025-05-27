import {getManifestObjects} from './blueGreenHelper'
import {Kubectl} from '../../types/kubectl'
import {BlueGreenRejectResult} from '../../types/blueGreenTypes'

import * as TSutils from '../../utilities/trafficSplitUtils'
import {
   rejectBlueGreenIngress,
   rejectBlueGreenService,
   rejectBlueGreenSMI
} from './reject'

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

   test('reject blue/green service', async () => {
      const value = await rejectBlueGreenService(kubectl, testObjects)

      const bgDeployment = value.routeResult
      const deleteResult = value.deleteResult

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
