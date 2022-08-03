import * as core from '@actions/core'


import { getManifestObjects } from './blueGreenHelper'
import {promoteBlueGreenIngress, promoteBlueGreenService} from './promote'
import { Kubectl } from '../../types/kubectl'
import { rejectBlueGreenIngress, rejectBlueGreenService } from './reject'

let testObjects
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
jest.mock('../../types/kubectl')

describe("promote tests", () => {
    beforeEach(() => {
        //@ts-ignore
        Kubectl.mockClear()
        testObjects = getManifestObjects(ingressFilepath)
    })

    test("reject blue/green ingress", () => {
        let kubectl = new Kubectl("")
        let result = rejectBlueGreenIngress(kubectl, testObjects)
    })
})