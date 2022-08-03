import { BlueGreenDeployment, getManifestObjects } from './blueGreenHelper'
import {deployBlueGreen, deployBlueGreenIngress} from './deploy'
import { Kubectl } from '../../types/kubectl'
import * as deployTester from './deploy'
import * as routeTester from './route'
import { RouteStrategy } from '../../types/routeStrategy'
import * as TSutils from '../../utilities/trafficSplitUtils'

let testObjects
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
jest.mock('../../types/kubectl')

describe("deploy tests", () => {
    beforeEach(() => {
        //@ts-ignore
        Kubectl.mockClear()
        testObjects = getManifestObjects(ingressFilepath)
    })

    test("correctly determines deploy type and acts accordingly", () => {
        const kubectl = new Kubectl("")
        jest.spyOn(routeTester, 'routeBlueGreenForDeploy').mockImplementation(() => Promise.resolve())
        jest.spyOn(TSutils, 'getTrafficSplitAPIVersion').mockImplementation(() => Promise.resolve(""))

        const mockReturn: Promise<BlueGreenDeployment> = Promise.resolve({deployResult: {result: {exitCode: 0, stderr: "", stdout: ""}, manifestFiles: []}, objects: []})
        jest.spyOn(deployTester, 'deployBlueGreenIngress').mockImplementationOnce(() => mockReturn)
        const ingressResult = deployBlueGreen(kubectl, ingressFilepath, RouteStrategy.INGRESS)
        ingressResult.then((result) => {
            expect(result.objects.length).toBe(2)
        })

        jest.spyOn(deployTester, 'deployBlueGreenService').mockImplementationOnce(() => mockReturn)
        const svcResult = deployTester.deployBlueGreen(kubectl, ingressFilepath, RouteStrategy.SERVICE)
        svcResult.then((result) => {
            expect(result.objects.length).toBe(2)
        })

        jest.spyOn(deployTester, 'deployBlueGreenSMI').mockImplementationOnce(() => mockReturn)
        const smiResult = deployTester.deployBlueGreen(kubectl, ingressFilepath, RouteStrategy.SMI)
        smiResult.then((result) => {
            expect(result.objects.length).toBe(3)
        })

    })

    test("correctly deploys blue/green ingress", () => {
        const kc = new Kubectl("")
        const result = deployBlueGreenIngress(kc, ingressFilepath)

        result.then((value) => {
            const nol = value.objects.map(obj => {
                if(obj.kind === "Service"){
                    expect(obj.metadata.name).toBe('nginx-service-green')
                }
                if(obj.kind === "Deployment"){
                    expect(obj.metadata.name).toBe('nginx-deployment-green')
                }
            })
           
        })
    })
})