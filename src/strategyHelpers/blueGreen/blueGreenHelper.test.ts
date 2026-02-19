import {vi} from 'vitest'
import type {MockInstance} from 'vitest'
import {
   deployWithLabel,
   deleteGreenObjects,
   deployObjects,
   fetchResource,
   getDeploymentMatchLabels,
   getManifestObjects,
   getNewBlueGreenObject,
   GREEN_LABEL_VALUE,
   isServiceRouted
} from './blueGreenHelper.js'
import {BlueGreenDeployment} from '../../types/blueGreenTypes.js'
import * as bgHelper from './blueGreenHelper.js'
import {Kubectl} from '../../types/kubectl.js'
import * as fileHelper from '../../utilities/fileUtils.js'
import {K8sObject} from '../../types/k8sObject.js'
import * as manifestUpdateUtils from '../../utilities/manifestUpdateUtils.js'
import {ExecOutput} from '@actions/exec'

vi.mock('../../types/kubectl')

const kubectl = new Kubectl('')
const TEST_TIMEOUT = '60s'

// Test constants to follow DRY principle
const EXPECTED_GREEN_OBJECTS = [
   {name: 'nginx-service-green', kind: 'Service'},
   {name: 'nginx-deployment-green', kind: 'Deployment'}
]

const MOCK_EXEC_OUTPUT = {
   exitCode: 0,
   stderr: '',
   stdout: ''
} as ExecOutput

describe('bluegreenhelper functions', () => {
   let testObjects
   beforeEach(() => {
      vi.restoreAllMocks()
      vi.mocked(Kubectl).mockClear()
      testObjects = getManifestObjects(['test/unit/manifests/test-ingress.yml'])

      vi.spyOn(fileHelper, 'writeObjectsToFile').mockImplementationOnce(() => [
         ''
      ])
   })

   test('correctly deletes services and workloads according to label', async () => {
      vi.spyOn(bgHelper, 'deleteObjects').mockReturnValue({} as Promise<void>)

      const value = await deleteGreenObjects(
         kubectl,
         [].concat(
            testObjects.deploymentEntityList,
            testObjects.serviceEntityList
         ),
         TEST_TIMEOUT
      )

      expect(value).toHaveLength(EXPECTED_GREEN_OBJECTS.length)
      EXPECTED_GREEN_OBJECTS.forEach((expectedObject) => {
         expect(value).toContainEqual(expectedObject)
      })
   })

   test('handles timeout when deleting objects', async () => {
      const deleteMock = vi.fn().mockResolvedValue(MOCK_EXEC_OUTPUT)
      kubectl.delete = deleteMock

      const deleteList = EXPECTED_GREEN_OBJECTS

      await bgHelper.deleteObjects(kubectl, deleteList, TEST_TIMEOUT)

      expect(deleteMock).toHaveBeenCalledTimes(deleteList.length)
      deleteList.forEach(({name, kind}) => {
         expect(deleteMock).toHaveBeenCalledWith(
            [kind, name],
            undefined,
            TEST_TIMEOUT
         )
      })
   })

   test('parses objects correctly from one file (getManifestObjects)', () => {
      const expectedTypes = [
         {
            list: testObjects.deploymentEntityList,
            kind: 'Deployment',
            selectorApp: 'nginx'
         },
         {list: testObjects.serviceEntityList, kind: 'Service'},
         {list: testObjects.ingressEntityList, kind: 'Ingress'}
      ]

      expectedTypes.forEach(({list, kind, selectorApp}) => {
         expect(list[0].kind).toBe(kind)
         if (selectorApp) {
            expect(list[0].spec.selector.matchLabels.app).toBe(selectorApp)
         }
      })
   })

   test('parses other kinds of objects (getManifestObjects)', () => {
      const otherObjectsCollection = getManifestObjects([
         'test/unit/manifests/anomaly-objects-test.yml'
      ])
      expect(
         otherObjectsCollection.unroutedServiceEntityList[0].metadata.name
      ).toBe('unrouted-service')
      expect(otherObjectsCollection.otherObjects[0].metadata.name).toBe(
         'foobar-rollout'
      )
   })

   test('correctly classifies routed services', () => {
      expect(
         isServiceRouted(
            testObjects.serviceEntityList[0],
            testObjects.deploymentEntityList
         )
      ).toBe(true)
      testObjects.serviceEntityList[0].spec.selector.app = 'fakeapp'
      expect(
         isServiceRouted(
            testObjects.serviceEntityList[0],
            testObjects.deploymentEntityList
         )
      ).toBe(false)
   })

   test('correctly makes labeled workloads', async () => {
      const kubectlApplySpy = vi.spyOn(kubectl, 'apply').mockResolvedValue({
         stdout: 'deployment.apps/nginx-deployment created',
         stderr: '',
         exitCode: 0
      })

      const cwlResult: BlueGreenDeployment = await deployWithLabel(
         kubectl,
         testObjects.deploymentEntityList,
         GREEN_LABEL_VALUE
      )
      expect(cwlResult.deployResult.manifestFiles[0]).toBe('')

      kubectlApplySpy.mockRestore()
   })

   test('correctly makes new blue green object (getNewBlueGreenObject and addBlueGreenLabelsAndAnnotations)', () => {
      const testCases = [
         {
            object: testObjects.deploymentEntityList[0],
            expectedName: 'nginx-deployment-green'
         },
         {
            object: testObjects.serviceEntityList[0],
            expectedName: 'nginx-service-green'
         }
      ]

      testCases.forEach(({object, expectedName}) => {
         const modifiedObject = getNewBlueGreenObject(object, GREEN_LABEL_VALUE)
         expect(modifiedObject.metadata.name).toBe(expectedName)
         expect(modifiedObject.metadata.labels['k8s.deploy.color']).toBe(
            'green'
         )
      })
   })

   test('correctly fetches k8s objects', async () => {
      const mockExecOutput = {
         stderr: '',
         stdout: JSON.stringify(testObjects.deploymentEntityList[0]),
         exitCode: 0
      }

      vi.spyOn(kubectl, 'getResource').mockImplementation(() =>
         Promise.resolve(mockExecOutput)
      )
      const fetched = await fetchResource(
         kubectl,
         'nginx-deployment',
         'Deployment'
      )
      expect(fetched.metadata.name).toBe('nginx-deployment')
   })

   test('exits when fails to fetch k8s objects', async () => {
      const errorTestCases = [
         {
            description: 'with stderr error',
            mockOutput: {
               stdout: 'this should not matter',
               exitCode: 0,
               stderr: 'this is a fake error'
            } as ExecOutput,
            mockImplementation: () => Promise.resolve
         },
         {
            description: 'with undefined implementation',
            mockOutput: null,
            mockImplementation: () => undefined
         }
      ]

      for (const testCase of errorTestCases) {
         const spy = vi.spyOn(kubectl, 'getResource')

         if (testCase.mockOutput) {
            spy.mockImplementation(() => Promise.resolve(testCase.mockOutput))
         } else {
            spy.mockResolvedValue(null)
         }

         const fetched = await fetchResource(
            kubectl,
            'nginx-deployment',
            'Deployment'
         )
         expect(fetched).toBe(null)

         spy.mockRestore()
      }
   })

   test('returns undefined when fetch fails to unset k8s objects', async () => {
      const mockExecOutput = {
         stdout: JSON.stringify(testObjects.deploymentEntityList[0]),
         exitCode: 0,
         stderr: ''
      } as ExecOutput

      vi.spyOn(kubectl, 'getResource').mockResolvedValue(mockExecOutput)
      vi.spyOn(
         manifestUpdateUtils,
         'UnsetClusterSpecificDetails'
      ).mockImplementation(() => {
         throw new Error('test error')
      })

      expect(
         await fetchResource(kubectl, 'nginx-deployment', 'Deployment')
      ).toBeUndefined()
   })

   test('gets deployment labels', () => {
      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = GREEN_LABEL_VALUE
      const mockPodObject: K8sObject = {
         kind: 'Pod',
         metadata: {name: 'testPod', labels: mockLabels},
         spec: {}
      }
      expect(
         getDeploymentMatchLabels(mockPodObject)[
            bgHelper.BLUE_GREEN_VERSION_LABEL
         ]
      ).toBe(GREEN_LABEL_VALUE)
      expect(
         getDeploymentMatchLabels(testObjects.deploymentEntityList[0])['app']
      ).toBe('nginx')
   })

   describe('deployObjects', () => {
      let mockObjects: any[]
      let kubectlApplySpy: MockInstance

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
         // //@ts-ignore
         // Kubectl.mockClear()
         mockObjects = [testObjects.deploymentEntityList[0]]
         kubectlApplySpy = vi.spyOn(kubectl, 'apply')
      })

      afterEach(() => {
         vi.clearAllMocks()
      })

      it('should return execution result and manifest files when kubectl apply succeeds', async () => {
         kubectlApplySpy.mockClear()
         kubectlApplySpy.mockResolvedValue(mockSuccessResult)

         const result = await deployObjects(kubectl, mockObjects)

         expect(result.execResult).toEqual(mockSuccessResult)
         const timeoutArg = kubectlApplySpy.mock.calls[0][3]
         expect(
            typeof timeoutArg === 'string' || timeoutArg === undefined
         ).toBe(true)

         expect(kubectlApplySpy).toHaveBeenCalledWith(
            expect.any(Array),
            expect.any(Boolean),
            expect.any(Boolean),
            timeoutArg
         )
         expect(kubectlApplySpy).toHaveBeenCalledTimes(1)
      })

      it('should throw an error when kubectl apply fails with non-zero exit code', async () => {
         kubectlApplySpy.mockClear()
         kubectlApplySpy.mockResolvedValue(mockFailureResult)

         await expect(deployObjects(kubectl, mockObjects)).rejects.toThrow()
         const timeoutArg = kubectlApplySpy.mock.calls[0][3]
         expect(
            typeof timeoutArg === 'string' || timeoutArg === undefined
         ).toBe(true)

         expect(kubectlApplySpy).toHaveBeenCalledWith(
            expect.any(Array),
            expect.any(Boolean),
            expect.any(Boolean),
            timeoutArg
         )
         expect(kubectlApplySpy).toHaveBeenCalledTimes(1)
      })
   })
})
