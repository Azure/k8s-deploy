import {getManifestObjects} from './blueGreenHelper'
import {BlueGreenDeployment} from '../../types/blueGreenTypes'
import {
   deployBlueGreen,
   deployBlueGreenIngress,
   deployBlueGreenService,
   deployBlueGreenSMI
} from './deploy'
import * as routeTester from './route'
import {Kubectl} from '../../types/kubectl'
import {RouteStrategy} from '../../types/routeStrategy'
import * as TSutils from '../../utilities/trafficSplitUtils'
import * as bgHelper from './blueGreenHelper'
import * as smiHelper from './smiBlueGreenHelper'

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

      // Mock kubectl.apply to return successful result
      jest.spyOn(kubectl, 'apply').mockResolvedValue({
         stdout: 'deployment.apps/nginx-deployment created',
         stderr: '',
         exitCode: 0
      })

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

      // Mock kubectl.apply to return successful result
      jest.spyOn(kc, 'apply').mockResolvedValue({
         stdout: 'deployment.apps/nginx-deployment created',
         stderr: '',
         exitCode: 0
      })

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

// Timeout tests
describe('deploy timeout tests', () => {
   let testObjects
   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()
      testObjects = getManifestObjects(ingressFilepath)
   })

   test('deployBlueGreen with timeout passes to strategy functions', async () => {
      const kubectl = new Kubectl('')
      const timeout = '300s'

      const mockBgDeployment: BlueGreenDeployment = {
         deployResult: {
            execResult: {exitCode: 0, stderr: '', stdout: ''},
            manifestFiles: []
         },
         objects: []
      }

      // Mock the helper functions that are actually called
      const deployWithLabelSpy = jest
         .spyOn(bgHelper, 'deployWithLabel')
         .mockResolvedValue(mockBgDeployment)
      const deployObjectsSpy = jest
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue({
            execResult: {exitCode: 0, stderr: '', stdout: ''},
            manifestFiles: []
         })
      const setupSMISpy = jest
         .spyOn(smiHelper, 'setupSMI')
         .mockResolvedValue(mockBgDeployment)
      const routeSpy = jest
         .spyOn(routeTester, 'routeBlueGreenForDeploy')
         .mockResolvedValue(mockBgDeployment)

      // Test INGRESS strategy
      await deployBlueGreen(
         kubectl,
         ingressFilepath,
         RouteStrategy.INGRESS,
         timeout
      )
      expect(deployWithLabelSpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         expect.any(String),
         timeout
      )

      // Test SERVICE strategy
      deployWithLabelSpy.mockClear()
      deployObjectsSpy.mockClear()
      await deployBlueGreen(
         kubectl,
         ingressFilepath,
         RouteStrategy.SERVICE,
         timeout
      )
      expect(deployWithLabelSpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         expect.any(String),
         timeout
      )

      // Test SMI strategy
      deployWithLabelSpy.mockClear()
      setupSMISpy.mockClear()
      await deployBlueGreen(
         kubectl,
         ingressFilepath,
         RouteStrategy.SMI,
         timeout
      )
      expect(setupSMISpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         timeout
      )

      deployWithLabelSpy.mockRestore()
      deployObjectsSpy.mockRestore()
      setupSMISpy.mockRestore()
      routeSpy.mockRestore()
   })

   test('deployBlueGreenIngress with timeout', async () => {
      const kubectl = new Kubectl('')
      const timeout = '240s'

      // Mock the dependencies
      const deployWithLabelSpy = jest
         .spyOn(bgHelper, 'deployWithLabel')
         .mockResolvedValue({
            deployResult: {
               execResult: {exitCode: 0, stderr: '', stdout: ''},
               manifestFiles: []
            },
            objects: []
         })
      const deployObjectsSpy = jest
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue({
            execResult: {exitCode: 0, stderr: '', stdout: ''},
            manifestFiles: []
         })

      await deployBlueGreenIngress(kubectl, ingressFilepath, timeout)

      // Verify deployWithLabel was called with timeout
      expect(deployWithLabelSpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         expect.any(String),
         timeout
      )

      // Verify deployObjects was called with timeout
      expect(deployObjectsSpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         timeout
      )

      deployWithLabelSpy.mockRestore()
      deployObjectsSpy.mockRestore()
   })

   test('deployBlueGreenService with timeout', async () => {
      const kubectl = new Kubectl('')
      const timeout = '180s'

      // Mock the dependencies
      const deployWithLabelSpy = jest
         .spyOn(bgHelper, 'deployWithLabel')
         .mockResolvedValue({
            deployResult: {
               execResult: {exitCode: 0, stderr: '', stdout: ''},
               manifestFiles: []
            },
            objects: []
         })
      const deployObjectsSpy = jest
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue({
            execResult: {exitCode: 0, stderr: '', stdout: ''},
            manifestFiles: []
         })

      await deployBlueGreenService(kubectl, ingressFilepath, timeout)

      // Verify deployWithLabel was called with timeout
      expect(deployWithLabelSpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         expect.any(String),
         timeout
      )

      // Verify deployObjects was called with timeout
      expect(deployObjectsSpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         timeout
      )

      deployWithLabelSpy.mockRestore()
      deployObjectsSpy.mockRestore()
   })

   test('deployBlueGreenSMI with timeout', async () => {
      const kubectl = new Kubectl('')
      const timeout = '360s'

      // Mock the dependencies
      const setupSMISpy = jest.spyOn(smiHelper, 'setupSMI').mockResolvedValue({
         objects: [],
         deployResult: {
            execResult: {exitCode: 0, stderr: '', stdout: ''},
            manifestFiles: []
         }
      })
      const deployObjectsSpy = jest
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue({
            execResult: {exitCode: 0, stderr: '', stdout: ''},
            manifestFiles: []
         })
      const deployWithLabelSpy = jest
         .spyOn(bgHelper, 'deployWithLabel')
         .mockResolvedValue({
            deployResult: {
               execResult: {exitCode: 0, stderr: '', stdout: ''},
               manifestFiles: []
            },
            objects: []
         })

      await deployBlueGreenSMI(kubectl, ingressFilepath, timeout)

      // Verify setupSMI was called with timeout
      expect(setupSMISpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         timeout
      )

      // Verify deployObjects was called with timeout
      expect(deployObjectsSpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         timeout
      )

      setupSMISpy.mockRestore()
      deployObjectsSpy.mockRestore()
      deployWithLabelSpy.mockRestore()
   })

   test('deploy functions without timeout should pass undefined', async () => {
      const kubectl = new Kubectl('')

      const deployWithLabelSpy = jest
         .spyOn(bgHelper, 'deployWithLabel')
         .mockResolvedValue({
            deployResult: {
               execResult: {exitCode: 0, stderr: '', stdout: ''},
               manifestFiles: []
            },
            objects: []
         })
      const deployObjectsSpy = jest
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue({
            execResult: {exitCode: 0, stderr: '', stdout: ''},
            manifestFiles: []
         })

      await deployBlueGreenIngress(kubectl, ingressFilepath)

      // Verify deployWithLabel was called with undefined timeout
      expect(deployWithLabelSpy).toHaveBeenCalledWith(
         kubectl,
         expect.any(Array),
         expect.any(String),
         undefined
      )

      deployWithLabelSpy.mockRestore()
      deployObjectsSpy.mockRestore()
   })
})
