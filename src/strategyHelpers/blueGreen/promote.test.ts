import * as core from '@actions/core'
import { getManifestObjects } from './blueGreenHelper'
import {promoteBlueGreenIngress, promoteBlueGreenService} from './promote'
import { Kubectl } from '../../types/kubectl'
import * as bgHelper from './blueGreenHelper'

let testObjects
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
jest.mock('../../types/kubectl')

describe("promote tests", () => {
    beforeEach(() => {
        //@ts-ignore
        Kubectl.mockClear()
        testObjects = getManifestObjects(ingressFilepath)
    })

    test("promote blue/green ingress", () => {
        jest.mock('')
        let kubectl = new Kubectl("")
        const mockLabels = new Map<string, string>()
        mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.GREEN_LABEL_VALUE
        core.debug("mock labels is " + JSON.stringify(mockLabels))

        jest.spyOn(bgHelper, "fetchResource").mockImplementation(() => Promise.resolve({metadata: {labels: mockLabels, name: "nginx-ingress-green"}}))
        let bgDeployment = promoteBlueGreenIngress(kubectl, testObjects)
        
        bgDeployment.then((value) => {
            let objects = value.objects
            expect(objects).toHaveLength(2)

            for(const obj of objects){
                if(obj.kind === "Service"){
                    expect(obj.metadata.name).toBe('nginx-service')
                } else if(obj.kind == "Deployment"){
                    expect(obj.metadata.name).toBe('nginx-deployment')
                }
                expect(obj.metadata.labels['k8s.deploy.color']).toBe('None')
            }

        })
    })

    test("fail to promote invalid blue/green ingress", async () => {
        let kubectl = new Kubectl("")
        const mockLabels = new Map<string,string>()
        mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.NONE_LABEL_VALUE
        jest.spyOn(bgHelper, "fetchResource").mockImplementation(() => Promise.resolve({metadata: {labels: mockLabels, name: "nginx-ingress"}}))
        
        await expect(promoteBlueGreenIngress(kubectl, testObjects)).rejects.toThrowError()

    })

    test("promote blue/green service", async () => {
        let kubectl = new Kubectl("")
        const mockLabels = new Map<string,string>()
        mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.GREEN_LABEL_VALUE
        jest.spyOn(bgHelper, "fetchResource").mockImplementation(() => Promise.resolve({metadata: {name: "nginx-service-green"}, spec: {selector: mockLabels}}))

        let bgDeployment = promoteBlueGreenService(kubectl, testObjects)

        bgDeployment.then(value => {
            expect(value.objects).toHaveLength(1)
            expect(value.objects[0].metadata.labels[bgHelper.BLUE_GREEN_VERSION_LABEL]).toBe(bgHelper.NONE_LABEL_VALUE)
            expect(value.objects[0].metadata.name).toBe("nginx-deployment")

        })
    })

    test("fail to promote invalid blue/green service", async () => {
        let kubectl = new Kubectl("")
        const mockLabels = new Map<string,string>()
        mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = bgHelper.NONE_LABEL_VALUE
        jest.spyOn(bgHelper, "fetchResource").mockImplementation(() => Promise.resolve({metadata: {name: "nginx-service"}, spec: {selector: mockLabels}}))
        
        await expect(promoteBlueGreenService(kubectl, testObjects)).rejects.toThrowError()

    })
})