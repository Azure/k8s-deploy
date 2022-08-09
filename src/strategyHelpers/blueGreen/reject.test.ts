import {getManifestObjects} from './blueGreenHelper'
import {Kubectl} from '../../types/kubectl'
import * as TSutils from '../../utilities/trafficSplitUtils'
import {
   rejectBlueGreenIngress,
   rejectBlueGreenService,
   rejectBlueGreenSMI,
   RejectResult
} from './reject'

let testObjects
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
let kubectl = new Kubectl('')

jest.mock('../../types/kubectl')

describe('reject tests', () => {
   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()
      testObjects = getManifestObjects(ingressFilepath)
   })

   test('reject blue/green ingress', async () => {
      let value = await rejectBlueGreenIngress(kubectl, testObjects)

      let bgDeployment = value.routeResult
      let deleteResult = value.deleteResult

      expect(deleteResult).toHaveLength(2)
      for (let obj of deleteResult) {
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
      let value = await rejectBlueGreenService(kubectl, testObjects)

      let bgDeployment = value.routeResult
      let deleteResult = value.deleteResult

      expect(deleteResult).toHaveLength(1)
      expect(deleteResult[0].name).toBe('nginx-deployment-green')

      expect(bgDeployment.objects).toHaveLength(1)
      expect(bgDeployment.objects[0].metadata.name).toBe('nginx-service')
   })

   test('reject blue/green SMI', async () => {
      jest
         .spyOn(TSutils, 'getTrafficSplitAPIVersion')
         .mockImplementation(() => Promise.resolve('v1alpha3'))
      let rejectResult = await rejectBlueGreenSMI(kubectl, testObjects)
      expect(rejectResult.deleteResult).toHaveLength(4)
   })
})
