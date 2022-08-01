import {getManifestObjects, GREEN_LABEL_VALUE} from './blueGreenHelper'
import {getUpdatedBlueGreenIngress, isIngressRouted} from './ingressBlueGreenHelper'
import {deployBlueGreenIngress} from './deploy'
import { Kubectl } from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'

let testObjects
let betaFilepath = ['test/unit/manifests/test-ingress.yml']
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']

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
        expect(updatedIng.metadata.labels['k8s.deploy.color']).toBe('green')
        expect(updatedIng.spec.rules[0].http.paths[0].backend.service.name).toBe('nginx-service-green')
    })
})

