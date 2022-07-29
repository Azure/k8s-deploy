import {getManifestObjects, GREEN_LABEL_VALUE} from './blueGreenHelper'
import {getUpdatedBlueGreenIngress, isIngressRouted} from './ingressBlueGreenHelper'
import {deployBlueGreenIngress} from './deploy'
import { routeBlueGreenIngress } from './route'
import { Kubectl } from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'

var testObjects
var betaFilepath = ['test/unit/manifests/test-ingress.yml']
var ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']

jest.mock('../../types/kubectl')

describe("ingress blue green helpers", () => {
    beforeEach(() => {
        //@ts-ignore
        Kubectl.mockClear()
        testObjects = getManifestObjects(ingressFilepath)
        jest.spyOn(fileHelper, 'writeObjectsToFile').mockImplementationOnce(() => [''])
    })

    test("it should correctly classify ingresses", () => {
        expect(isIngressRouted(testObjects.ingressEntityList[0], testObjects.serviceNameMap)).toBe(true)
        testObjects.ingressEntityList[0].spec.rules[0].http.paths = {}
        expect(isIngressRouted(testObjects.ingressEntityList[0], testObjects.serviceNameMap)).toBe(false)

        expect(isIngressRouted(getManifestObjects(betaFilepath).ingressEntityList[0], testObjects.serviceNameMap)).toBe(true)
    })

    test("it should correctly update ingresses", () => {
        const updatedIng = getUpdatedBlueGreenIngress(testObjects.ingressEntityList[0], testObjects.serviceNameMap, GREEN_LABEL_VALUE)
        //@ts-ignore
        expect(updatedIng.metadata.labels['k8s.deploy.color']).toBe('green')
        //@ts-ignore
        expect(updatedIng.spec.rules[0].http.paths[0].backend.service.name).toBe('nginx-service-green')
    })

    test("correctly prepares blue/green ingresses for deployment", () => {
        const kc = new Kubectl("")
        var generatedObjects = routeBlueGreenIngress(kc, testObjects.serviceNameMap, testObjects.ingressEntityList)
        generatedObjects.then((value) => {
            expect(value).toHaveLength(1) 
            //@ts-ignore
            expect(value[0].metadata.name).toBe('nginx-ingress')
        })
    })
    test("correctly deploys services", () => {
        const kc = new Kubectl("")
        const result = deployBlueGreenIngress(kc, ingressFilepath)

        result.then((value) => {
            const nol = value.objects
            //@ts-ignore
            expect(nol[0].metadata.name).toBe('nginx-service-green')
        })
    })
})

