import {getManifestObjects, GREEN_LABEL_VALUE} from './blueGreenHelper'
import {getUpdatedBlueGreenIngress, isIngressRouted, routeBlueGreenIngress} from './ingressBlueGreenHelper'
import { Kubectl } from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'

var testObjects
jest.mock('../../types/kubectl')
describe("ingress blue green helpers", () => {
    beforeEach(() => {
        //@ts-ignore
        Kubectl.mockClear()
        testObjects = getManifestObjects(['test/unit/manifests/test-ingress-new.yml'])
        jest.spyOn(fileHelper, 'writeObjectsToFile').mockImplementationOnce(() => [''])
    })

    test("it should correctly classify ingresses", () => {
        expect(isIngressRouted(testObjects.ingressEntityList[0], testObjects.serviceNameMap)).toBe(true)
        testObjects.ingressEntityList[0].spec.rules[0].http.paths = {}
        expect(isIngressRouted(testObjects.ingressEntityList[0], testObjects.serviceNameMap)).toBe(false)

        expect(isIngressRouted(getManifestObjects(['test/unit/manifests/test-ingress.yml']).ingressEntityList[0], testObjects.serviceNameMap)).toBe(true)
    })

    test("it should correctly update ingresses", () => {
        const updatedIng = getUpdatedBlueGreenIngress(testObjects.ingressEntityList[0], testObjects.serviceNameMap, GREEN_LABEL_VALUE)
        //@ts-ignore
        expect(updatedIng.metadata.labels['k8s.deploy.color']).toBe('green')
        //@ts-ignore
        expect(updatedIng.spec.rules[0].http.paths[0].backend.service.name).toBe('nginx-service-green')
    })

    test("correctly deploys blue/green ingresses", () => {
        const kc = new Kubectl("")
        var generatedObjects = routeBlueGreenIngress(kc, GREEN_LABEL_VALUE, testObjects.serviceNameMap, testObjects.ingressEntityList)
        generatedObjects.then((value) => {
            expect(value).toHaveLength(1) 
            //@ts-ignore
            expect(value[0].metadata.name).toBe('nginx-ingress')
        })
    })
})

