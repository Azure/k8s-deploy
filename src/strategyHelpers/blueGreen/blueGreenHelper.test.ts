import {
   createWorkloadsWithLabel,
   deleteWorkloadsAndServicesWithLabel,
   getManifestObjects,
   getNewBlueGreenObject,
   GREEN_LABEL_VALUE,
   isServiceRouted,
   NONE_LABEL_VALUE
} from './blueGreenHelper'
import * as bgHelper from './blueGreenHelper'
import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'

jest.mock('../../types/kubectl')

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

   test('it should parse objects correctly from one file', () => {
      expect(testObjects.deploymentEntityList[0].kind).toBe('Deployment')
      expect(testObjects.serviceEntityList[0].kind).toBe('Service')
      expect(testObjects.ingressEntityList[0].kind).toBe('Ingress')

      expect(
         testObjects.deploymentEntityList[0].spec.selector.matchLabels.app
      ).toBe('nginx')
   })

   test('correctly makes new blue green object', () => {
      const modifiedDeployment = getNewBlueGreenObject(
         testObjects.deploymentEntityList[0],
         GREEN_LABEL_VALUE
      )
      //@ts-ignore
      expect(modifiedDeployment.metadata.name).toBe('nginx-deployment-green')
      //@ts-ignore
      expect(modifiedDeployment.metadata.labels['k8s.deploy.color']).toBe(
         'green'
      )

      const modifiedSvc = getNewBlueGreenObject(
         testObjects.serviceEntityList[0],
         GREEN_LABEL_VALUE
      )
      //@ts-ignore
      expect(modifiedSvc.metadata.name).toBe('nginx-service-green')
      //@ts-ignore
      expect(modifiedSvc.metadata.labels['k8s.deploy.color']).toBe('green')
   })

   test('correctly makes labeled workloads', () => {
      const kubectl = new Kubectl('')
      expect(Kubectl).toBeCalledTimes(1)
      const cwlResult = createWorkloadsWithLabel(
         kubectl,
         testObjects.deploymentEntityList,
         GREEN_LABEL_VALUE
      )
      cwlResult.then((value) => {
         //@ts-ignore
         expect(value.newFilePaths[0]).toBe('')
      })
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

   test('correctly deletes services and workloads according to label', () => {
      const kubectl = new Kubectl('')
      jest.spyOn(bgHelper, 'deleteObjects').mockReturnValue({} as Promise<void>)

      var objectsToDelete = deleteWorkloadsAndServicesWithLabel(
         kubectl,
         NONE_LABEL_VALUE,
         testObjects.deploymentEntityList,
         testObjects.serviceEntityList
      )
      objectsToDelete.then((value) => {
         expect(value).toHaveLength(2)
         expect(value).toContainEqual
         ;({name: 'nginx-service', kind: 'Service'})
         expect(value).toContainEqual({
            name: 'nginx-deployment',
            kind: 'Deployment'
         })
      })

      objectsToDelete = deleteWorkloadsAndServicesWithLabel(
         kubectl,
         GREEN_LABEL_VALUE,
         testObjects.deploymentEntityList,
         testObjects.serviceEntityList
      )
      objectsToDelete.then((value) => {
         expect(value).toHaveLength(2)
         expect(value).toContainEqual({
            name: 'nginx-service-green',
            kind: 'Service'
         })
         expect(value).toContainEqual({
            name: 'nginx-deployment-green',
            kind: 'Deployment'
         })
      })
   })
})
