import { K8sIngress } from '../../types/k8sObject'
import { Kubectl } from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'

import {BlueGreenDeployment, BlueGreenManifests, getManifestObjects, GREEN_LABEL_VALUE} from './blueGreenHelper'
import {routeBlueGreenIngress} from './route'

jest.mock('../../types/kubectl')
let testObjects: BlueGreenManifests
let betaFilepath = ['test/unit/manifests/test-ingress.yml']
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']


describe("route function tests", () =>{
    beforeEach(() => {
        //@ts-ignore
        Kubectl.mockClear()
        testObjects = getManifestObjects(ingressFilepath)
        jest.spyOn(fileHelper, 'writeObjectsToFile').mockImplementationOnce(() => [''])
    })
    
    test("correctly prepares blue/green ingresses for deployment", () => {
        const kc = new Kubectl("")
        let generatedObjects: Promise<BlueGreenDeployment> = routeBlueGreenIngress(kc, testObjects.serviceNameMap, testObjects.ingressEntityList)
        generatedObjects.then((value) => {
            expect(value.objects).toHaveLength(1) 
            expect(value.objects[0].metadata.name).toBe('nginx-ingress')
            
            expect((value.objects[0] as K8sIngress).spec.rules[0].http.paths[0].backend.service.name).toBe('nginx-service-green')
        })
    })
})