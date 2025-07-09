import {
   deployWithLabel,
   deleteGreenObjects,
   fetchResource,
   getDeploymentMatchLabels,
   getManifestObjects,
   getNewBlueGreenObject,
   GREEN_LABEL_VALUE,
   isServiceRouted
} from './blueGreenHelper'
import {BlueGreenDeployment} from '../../types/blueGreenTypes'
import * as bgHelper from './blueGreenHelper'
import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import {K8sObject} from '../../types/k8sObject'
import * as manifestUpdateUtils from '../../utilities/manifestUpdateUtils'
import {ExecOutput} from '@actions/exec'

jest.mock('../../types/kubectl')

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
      //@ts-ignore
      Kubectl.mockClear()
      testObjects = getManifestObjects(['test/unit/manifests/test-ingress.yml'])

      jest
         .spyOn(fileHelper, 'writeObjectsToFile')
         .mockImplementationOnce(() => [''])
   })

   test('correctly deletes services and workloads according to label', async () => {
      jest.spyOn(bgHelper, 'deleteObjects').mockReturnValue({} as Promise<void>)

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
      // Mock deleteObjects to prevent actual execution
      const deleteSpy = jest
         .spyOn(kubectl, 'delete')
         .mockResolvedValue(MOCK_EXEC_OUTPUT)

      await bgHelper.deleteObjects(
         kubectl,
         EXPECTED_GREEN_OBJECTS,
         TEST_TIMEOUT
      )

      // Verify kubectl.delete is called with timeout for each object in deleteList
      expect(deleteSpy).toHaveBeenCalledTimes(EXPECTED_GREEN_OBJECTS.length)
      EXPECTED_GREEN_OBJECTS.forEach(({name, kind}) => {
         expect(deleteSpy).toHaveBeenCalledWith(
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
      const cwlResult: BlueGreenDeployment = await deployWithLabel(
         kubectl,
         testObjects.deploymentEntityList,
         GREEN_LABEL_VALUE
      )
      expect(cwlResult.deployResult.manifestFiles[0]).toBe('')
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

      jest
         .spyOn(kubectl, 'getResource')
         .mockImplementation(() => Promise.resolve(mockExecOutput))
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
         const spy = jest.spyOn(kubectl, 'getResource')

         if (testCase.mockOutput) {
            spy.mockImplementation(() => Promise.resolve(testCase.mockOutput))
         } else {
            spy.mockImplementation()
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

   test('returns null when fetch fails to unset k8s objects', async () => {
      const mockExecOutput = {
         stdout: 'this should not matter',
         exitCode: 0,
         stderr: 'this is a fake error'
      } as ExecOutput
      jest
         .spyOn(manifestUpdateUtils, 'UnsetClusterSpecificDetails')
         .mockImplementation(() => {
            throw new Error('test error')
         })
      expect(
         await fetchResource(kubectl, 'nginx-deployment', 'Deployment')
      ).toBe(null)
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
})
