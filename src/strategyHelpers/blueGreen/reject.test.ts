import * as core from '@actions/core'


import { getManifestObjects } from './blueGreenHelper'
import {promoteBlueGreenIngress, promoteBlueGreenService} from './promote'
import { Kubectl } from '../../types/kubectl'
import { rejectBlueGreenIngress, rejectBlueGreenService, RejectResult } from './reject'

let testObjects
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
jest.mock('../../types/kubectl')

describe("reject tests", () => {
    beforeEach(() => {
        //@ts-ignore
        Kubectl.mockClear()
        testObjects = getManifestObjects(ingressFilepath)
    })

    test("reject blue/green ingress", () => {
        let kubectl = new Kubectl("")
        let result: Promise<RejectResult> = rejectBlueGreenIngress(kubectl, testObjects)

        result.then(value => {
            let bgDeployment = value.routeResult
            let deleteResult = value.deleteResult

            expect(deleteResult).toHaveLength(2)
            for(let obj of deleteResult){
                if(obj.kind == "Service"){
                    expect(obj.name).toBe("nginx-service-green")
                }
                if(obj.kind == "Deployment"){
                    expect(obj.name).toBe("nginx-deployment-green")
                }
            }

            expect(bgDeployment.objects).toHaveLength(1)
            expect(bgDeployment.objects[0].metadata.name).toBe("nginx-ingress")
        })
    })

    test("reject blue/green service", () => {
        let kubectl = new Kubectl("")
        let result: Promise<RejectResult> = rejectBlueGreenService(kubectl, testObjects)

        result.then(value => {
            let bgDeployment = value.routeResult
            let deleteResult = value.deleteResult

            expect(deleteResult).toHaveLength(1)
            expect(deleteResult[0].name).toBe("nginx-deployment-green")

            expect(bgDeployment.objects).toHaveLength(1)
            expect(bgDeployment.objects[0].metadata.name).toBe("nginx-service")
        })
    })
})