import {getManifestObjects} from './blueGreenHelper'
import {BlueGreenDeployment} from '../../types/blueGreenTypes'
import {deployBlueGreen, deployBlueGreenIngress} from './deploy'
import * as routeTester from './route'
import {Kubectl} from '../../types/kubectl'
import {RouteStrategy} from '../../types/routeStrategy'
import * as TSutils from '../../utilities/trafficSplitUtils'

const ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']

jest.mock('../../types/kubectl')

describe('deploy tests', () => {
   let testObjects
   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()
      testObjects = getManifestObjects(ingressFilepath)
   })

   test('correctly determines deploy type and acts accordingly', async () => {
      const kubectl = new Kubectl('')
      const mockBgDeployment: BlueGreenDeployment = {
         deployResult: {
            execResult: {exitCode: 0, stderr: '', stdout: ''},
            manifestFiles: []
         },
         objects: []
      }

      jest
         .spyOn(routeTester, 'routeBlueGreenForDeploy')
         .mockImplementation(() => Promise.resolve(mockBgDeployment))
      jest
         .spyOn(TSutils, 'getTrafficSplitAPIVersion')
         .mockImplementation(() => Promise.resolve('v1alpha3'))

      const ingressResult = await deployBlueGreen(
         kubectl,
         ingressFilepath,
         RouteStrategy.INGRESS
      )

      expect(ingressResult.objects.length).toBe(2)

      const result = await deployBlueGreen(
         kubectl,
         ingressFilepath,
         RouteStrategy.SERVICE
      )

      expect(result.objects.length).toBe(2)

      const smiResult = await deployBlueGreen(
         kubectl,
         ingressFilepath,
         RouteStrategy.SMI
      )

      expect(smiResult.objects.length).toBe(6)
   })

   test('correctly deploys blue/green ingress', async () => {
      const kc = new Kubectl('')
      const value = await deployBlueGreenIngress(kc, ingressFilepath)
      const nol = value.objects.map((obj) => {
         if (obj.kind === 'Service') {
            expect(obj.metadata.name).toBe('nginx-service-green')
         }
         if (obj.kind === 'Deployment') {
            expect(obj.metadata.name).toBe('nginx-deployment-green')
         }
      })
   })
})
