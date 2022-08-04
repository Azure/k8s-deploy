import * as core from '@actions/core'
import { TrafficSplitBackend, TrafficSplitObject} from '../../types/k8sObject'
import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import * as TSutils from '../../utilities/trafficSplitUtils'

import {
   BlueGreenDeployment,
   BlueGreenManifests,
   BLUE_GREEN_VERSION_LABEL,
   getManifestObjects,
   GREEN_LABEL_VALUE,
   NONE_LABEL_VALUE
} from './blueGreenHelper'

import { createTrafficSplitObject, MAX_VAL, MIN_VAL, setupSMI } from './smiBlueGreenHelper'

jest.mock('../../types/kubectl')
let testObjects: BlueGreenManifests
let kc = new Kubectl("")
let betaFilepath = ['test/unit/manifests/test-ingress.yml']
let ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']

describe('SMI Helper tests', () => {
   beforeEach(() => {
      //@ts-ignore
      Kubectl.mockClear()

      jest.spyOn(TSutils, 'getTrafficSplitAPIVersion').mockImplementation(() => Promise.resolve(""))


      testObjects = getManifestObjects(ingressFilepath)
      jest
         .spyOn(fileHelper, 'writeObjectsToFile')
         .mockImplementationOnce(() => [''])
   })

   test('setupSMI tests', () => {
    const smiResults = setupSMI(kc, testObjects.serviceEntityList)

    smiResults.then(value => {
        let found = 0
        for(let obj of value.objects){

            core.debug('obj is ' + JSON.stringify(obj))
            
            if(obj.metadata.name === "nginx-service-stable"){
                expect(obj.metadata.labels[BLUE_GREEN_VERSION_LABEL]).toBe(NONE_LABEL_VALUE)
                expect(obj.spec.selector.app).toBe("nginx")
                found++
            }

            if(obj.metadata.name === "nginx-service-green"){
                expect(obj.metadata.labels[BLUE_GREEN_VERSION_LABEL]).toBe(GREEN_LABEL_VALUE)
                found++
            }

            if(obj.metadata.name === "nginx-service-trafficsplit"){
                found++
                // expect stable weight to be max val
                const casted = obj as TrafficSplitObject
                expect(casted.spec.backends).toHaveLength(2)
                for(let be of casted.spec.backends){
                    if(be.service === "nginx-service-stable"){
                        expect(be.weight).toBe(MAX_VAL)
                    }
                    if(be.service === "nginx-service-green"){
                        expect(be.weight).toBe(MIN_VAL)
                    }
                }
            }
        }

        expect(found).toBe(3)
    })

   })

   test('createTrafficSplitObject tests', async () => {
        const noneResult: TrafficSplitObject = await createTrafficSplitObject(kc, testObjects.serviceEntityList[0].metadata.name, NONE_LABEL_VALUE)
        expect(noneResult.metadata.name).toBe('nginx-service-trafficsplit')
        for(let be of noneResult.spec.backends){
            if(be.service === "nginx-service-stable"){
                expect(be.weight).toBe(MAX_VAL)
            }
            if(be.service === "nginx-service-green"){
                expect(be.weight).toBe(MIN_VAL)
            }
        }
        
        const greenResult: TrafficSplitObject = await createTrafficSplitObject(kc, testObjects.serviceEntityList[0].metadata.name, GREEN_LABEL_VALUE)
        core.debug('ts obj is ' + JSON.stringify(greenResult))

        expect(greenResult.metadata.name).toBe('nginx-service-trafficsplit')
        for(let be of greenResult.spec.backends){
            if(be.service === "nginx-service-stable"){
                expect(be.weight).toBe(MIN_VAL)
            }
            if(be.service === "nginx-service-green"){
                expect(be.weight).toBe(MAX_VAL)
            }
        }
   })



   test('getSMIServiceResource test', () => {

   })

   test('validateTrafficSplitsState', () => {})
})
