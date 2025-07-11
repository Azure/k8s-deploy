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
import {ExecOutput} from '@actions/exec'

const ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']

jest.mock('../../types/kubectl')

// Shared variables and mock objects used across all test suites
const mockDeployResult = {
   execResult: {exitCode: 0, stderr: '', stdout: ''},
   manifestFiles: []
}

const mockBgDeployment: BlueGreenDeployment = {
   deployResult: mockDeployResult,
   objects: []
}

describe('deploy tests', () => {
   let kubectl: Kubectl
   let kubectlApplySpy: jest.SpyInstance

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

   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()
      kubectl = new Kubectl('')
      kubectlApplySpy = jest.spyOn(kubectl, 'apply')
   })

   test('correctly determines deploy type and acts accordingly', async () => {
      kubectlApplySpy.mockResolvedValue(mockSuccessResult)

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
      kubectlApplySpy.mockResolvedValue(mockSuccessResult)

      const value = await deployBlueGreenIngress(kubectl, ingressFilepath)
      const nol = value.objects.map((obj) => {
         if (obj.kind === 'Service') {
            expect(obj.metadata.name).toBe('nginx-service-green')
         }
         if (obj.kind === 'Deployment') {
            expect(obj.metadata.name).toBe('nginx-deployment-green')
         }
      })
   })

   // Consolidated error tests
   test.each([
      {
         name: 'should throw error when kubectl apply fails during blue/green ingress deployment',
         fn: () => deployBlueGreenIngress(kubectl, ingressFilepath),
         setup: () => {}
      },
      {
         name: 'should throw error when kubectl apply fails during blue/green deployment with INGRESS strategy',
         fn: () =>
            deployBlueGreen(kubectl, ingressFilepath, RouteStrategy.INGRESS),
         setup: () => {
            jest
               .spyOn(routeTester, 'routeBlueGreenForDeploy')
               .mockImplementation(() => Promise.resolve(mockBgDeployment))
            jest
               .spyOn(TSutils, 'getTrafficSplitAPIVersion')
               .mockImplementation(() => Promise.resolve('v1alpha3'))
         }
      },
      {
         name: 'should throw error when kubectl apply fails during blue/green deployment with SERVICE strategy',
         fn: () =>
            deployBlueGreen(kubectl, ingressFilepath, RouteStrategy.SERVICE),
         setup: () => {
            jest
               .spyOn(routeTester, 'routeBlueGreenForDeploy')
               .mockImplementation(() => Promise.resolve(mockBgDeployment))
            jest
               .spyOn(TSutils, 'getTrafficSplitAPIVersion')
               .mockImplementation(() => Promise.resolve('v1alpha3'))
         }
      },
      {
         name: 'should throw error when kubectl apply fails during blue/green deployment with SMI strategy',
         fn: () => deployBlueGreen(kubectl, ingressFilepath, RouteStrategy.SMI),
         setup: () => {
            jest
               .spyOn(routeTester, 'routeBlueGreenForDeploy')
               .mockImplementation(() => Promise.resolve(mockBgDeployment))
            jest
               .spyOn(TSutils, 'getTrafficSplitAPIVersion')
               .mockImplementation(() => Promise.resolve('v1alpha3'))
         }
      },
      {
         name: 'should throw error when deployBlueGreenService fails',
         fn: () => deployBlueGreenService(kubectl, ingressFilepath),
         setup: () => {}
      },
      {
         name: 'should throw error when deployBlueGreenSMI fails',
         fn: () => deployBlueGreenSMI(kubectl, ingressFilepath),
         setup: () => {}
      }
   ])('$name', async ({fn, setup}) => {
      kubectlApplySpy.mockResolvedValue(mockFailureResult)
      setup()

      await expect(fn()).rejects.toThrow()

      const lastArg = kubectlApplySpy.mock.calls[0][3]
      expect(kubectlApplySpy).toHaveBeenCalledWith(
         expect.any(Array),
         expect.any(Boolean),
         expect.any(Boolean),
         expect(typeof lastArg === 'string' || lastArg === undefined).toBe(true)
      )
      expect(kubectlApplySpy).toHaveBeenCalledTimes(1)
   })
})

// Timeout tests
describe('deploy timeout tests', () => {
   let kubectl: Kubectl

   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()
      kubectl = new Kubectl('')
   })

   test('deployBlueGreen with timeout passes to strategy functions', async () => {
      const timeout = '300s'

      // Mock the helper functions that are actually called
      const deployWithLabelSpy = jest
         .spyOn(bgHelper, 'deployWithLabel')
         .mockResolvedValue(mockBgDeployment)
      const deployObjectsSpy = jest
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue(mockDeployResult)
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
      const timeout = '240s'

      // Mock the dependencies
      const deployWithLabelSpy = jest
         .spyOn(bgHelper, 'deployWithLabel')
         .mockResolvedValue(mockBgDeployment)
      const deployObjectsSpy = jest
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue(mockDeployResult)

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
      const timeout = '180s'

      // Mock the dependencies
      const deployWithLabelSpy = jest
         .spyOn(bgHelper, 'deployWithLabel')
         .mockResolvedValue(mockBgDeployment)
      const deployObjectsSpy = jest
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue(mockDeployResult)

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
      const timeout = '360s'

      // Mock the dependencies
      const setupSMISpy = jest
         .spyOn(smiHelper, 'setupSMI')
         .mockResolvedValue(mockBgDeployment)
      const deployObjectsSpy = jest
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue(mockDeployResult)
      const deployWithLabelSpy = jest
         .spyOn(bgHelper, 'deployWithLabel')
         .mockResolvedValue(mockBgDeployment)

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
      const deployWithLabelSpy = jest
         .spyOn(bgHelper, 'deployWithLabel')
         .mockResolvedValue(mockBgDeployment)
      const deployObjectsSpy = jest
         .spyOn(bgHelper, 'deployObjects')
         .mockResolvedValue(mockDeployResult)

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
