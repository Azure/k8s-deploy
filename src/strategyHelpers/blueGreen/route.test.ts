import {K8sIngress} from '../../types/k8sObject'
import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import {RouteStrategy} from '../../types/routeStrategy'

import {
   BlueGreenDeployment,
   BlueGreenManifests,
   BLUE_GREEN_VERSION_LABEL,
   getManifestObjects,
   GREEN_LABEL_VALUE
} from './blueGreenHelper'
import {routeBlueGreenIngress, routeBlueGreenService, routeBlueGreenForDeploy} from './route'

jest.mock('../../types/kubectl')
let testObjects: BlueGreenManifests
let betaFilepath = ['test/unit/manifests/test-ingress.yml']
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']

describe('route function tests', () => {
   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()

      testObjects = getManifestObjects(ingressFilepath)
      jest
         .spyOn(fileHelper, 'writeObjectsToFile')
         .mockImplementationOnce(() => [''])
   })

   test('correctly prepares blue/green ingresses for deployment', () => {
      const kc = new Kubectl('')
      let generatedObjects: Promise<BlueGreenDeployment> =
         routeBlueGreenIngress(
            kc,
            testObjects.serviceNameMap,
            testObjects.ingressEntityList
         )
      generatedObjects.then((value) => {
         expect(value.objects).toHaveLength(1)
         expect(value.objects[0].metadata.name).toBe('nginx-ingress')
         expect(
            (value.objects[0] as K8sIngress).spec.rules[0].http.paths[0].backend
               .service.name
         ).toBe('nginx-service-green')
      })
   })

   test('correctly prepares blue/green services for deployment', () => {
      const kc = new Kubectl('')
      let generatedObjects: Promise<BlueGreenDeployment> =
         routeBlueGreenService(
            kc,
            GREEN_LABEL_VALUE,
            testObjects.serviceEntityList
         )
      generatedObjects.then((value) => {
         expect(value.objects).toHaveLength(1)
         expect(value.objects[0].metadata.name).toBe('nginx-service')

         expect(
            value.objects[0].metadata.labels[BLUE_GREEN_VERSION_LABEL]
         ).toBe(GREEN_LABEL_VALUE)
      })
   })

   test('correctly identifies route pattern and acts accordingly', () => {
    const kubectl = new Kubectl('')

    const ingressResult = routeBlueGreenForDeploy(
       kubectl,
       ingressFilepath,
       RouteStrategy.INGRESS
    )
    ingressResult.then((result) => {
       expect(result.objects.length).toBe(1)
       expect(result.objects[0].metadata.name).toBe('nginx-ingress')
    })

    const serviceResult = routeBlueGreenForDeploy(
       kubectl,
       ingressFilepath,
       RouteStrategy.SERVICE
    )
    serviceResult.then((result) => {
       expect(result.objects.length).toBe(1)
       expect(result.objects[0].metadata.name).toBe('nginx-service')
    })
    // COME BACK TO THIS - WHY IS COVERAGE INACCURATE?
    // routeBlueGreenForDeploy(kubectl, ingressFilepath, RouteStrategy.SMI)
 })
})
