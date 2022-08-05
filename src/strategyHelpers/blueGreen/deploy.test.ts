import { BlueGreenDeployment, getManifestObjects } from './blueGreenHelper'
import {deployBlueGreen, deployBlueGreenIngress} from './deploy'
import { Kubectl } from '../../types/kubectl'
import { RouteStrategy } from '../../types/routeStrategy'
import * as TSutils from '../../utilities/trafficSplitUtils'
import { ExecOutput } from '@actions/exec'

let testObjects
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
const mockExecOutput = {stderr: '', stdout: 'v1alpha3', exitCode: 0}

jest.mock('../../types/kubectl')

describe("deploy tests", () => {
    beforeEach(() => {
        //@ts-ignore
        Kubectl.mockClear()
        testObjects = getManifestObjects(ingressFilepath)
    })

    test("correctly determines deploy type and acts accordingly", () => {
        const kubectl = new Kubectl("")

        jest.spyOn(TSutils, 'getTrafficSplitAPIVersion').mockImplementation(() => Promise.resolve("v1alpha3"))

        const ingressResult = deployBlueGreen(kubectl, ingressFilepath, RouteStrategy.INGRESS)
        ingressResult.then((result) => {
            expect(result.objects.length).toBe(2)
        })

        const svcResult = deployBlueGreen(kubectl, ingressFilepath, RouteStrategy.SERVICE)
        svcResult.then((result) => {
            expect(result.objects.length).toBe(2)
        })

        const smiResult = deployBlueGreen(kubectl, ingressFilepath, RouteStrategy.SMI)
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