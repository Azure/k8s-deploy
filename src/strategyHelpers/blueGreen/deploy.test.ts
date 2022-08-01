import {deployBlueGreenIngress} from './deploy'
import { Kubectl } from '../../types/kubectl'

let testObjects
let betaFilepath = ['test/unit/manifests/test-ingress.yml']
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']

describe("deploy tests", () => {
    test("correctly deploys services", () => {
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