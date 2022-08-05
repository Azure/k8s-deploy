import * as core from '@actions/core'
import {Kubectl} from '../../types/kubectl'
import * as kubectlUtils from '../../utilities/trafficSplitUtils'
import * as fileHelper from '../../utilities/fileUtils'
import {
   BlueGreenManifests,
   deployWithLabel,
   deleteObjects,
   deleteGreenObjects,
   deployObjects,
   fetchResource,
   getBlueGreenResourceName,
   getManifestObjects,
   getNewBlueGreenObject,
   GREEN_LABEL_VALUE,
   GREEN_SUFFIX,
   NONE_LABEL_VALUE,
   STABLE_SUFFIX,
   BlueGreenDeployment
} from './blueGreenHelper'
import { K8sDeleteObject, K8sIngress, K8sObject, TrafficSplitObject } from '../../types/k8sObject'
import { ExecOutput } from '@actions/exec'
import { DeployResult } from '../../types/deployResult'
import { exec } from 'child_process'

export const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = '-trafficsplit'
export const TRAFFIC_SPLIT_OBJECT = 'TrafficSplit'
export const MIN_VAL = 0
export const MAX_VAL = 100


export async function setupSMI(kubectl: Kubectl, serviceEntityList: any[]): Promise<BlueGreenDeployment> {
   const newObjectsList = []
   const trafficObjectList = []

   serviceEntityList.forEach((serviceObject) => {
      // create a trafficsplit for service
      trafficObjectList.push(serviceObject)
      // set up the services for trafficsplit
      const newStableService = getStableSMIServiceResource(
         serviceObject)
      const newGreenService = getGreenSMIServiceResource(serviceObject)
      newObjectsList.push(newStableService)
      newObjectsList.push(newGreenService)
   })

   // create services
   let servicesDeploymentResult: DeployResult = await deployObjects(kubectl, newObjectsList)

   let tsObjects: TrafficSplitObject[] = []
   // route to stable service
   for(let svc of trafficObjectList){
      const tsObject = await createTrafficSplitObject(
         kubectl,
         svc.metadata.name,
         NONE_LABEL_VALUE
      )
      tsObjects.push(tsObject as TrafficSplitObject)
   }

   return {objects: newObjectsList.concat(tsObjects), deployResult: servicesDeploymentResult}
}

let trafficSplitAPIVersion = ''

export async function createTrafficSplitObject(
   kubectl: Kubectl,
   name: string,
   nextLabel: string
): Promise<TrafficSplitObject> {
   // cache traffic split api version
   if (!trafficSplitAPIVersion)
      trafficSplitAPIVersion = await kubectlUtils.getTrafficSplitAPIVersion(
         kubectl
      )

   // decide weights based on nextlabel
   const stableWeight: number =
      nextLabel === GREEN_LABEL_VALUE ? MIN_VAL : MAX_VAL
   const greenWeight: number =
      nextLabel === GREEN_LABEL_VALUE ? MAX_VAL : MIN_VAL

   const trafficSplitObject: TrafficSplitObject = {
      apiVersion: trafficSplitAPIVersion,
      kind: TRAFFIC_SPLIT_OBJECT,
      metadata: {
         name: getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX),
         labels: new Map<string, string>()
      },
      spec: {
         service: name,
         backends: [
            {
               service: getBlueGreenResourceName(name, STABLE_SUFFIX),
               weight: stableWeight
            },
            {
               service: getBlueGreenResourceName(name, GREEN_SUFFIX),
               weight: greenWeight
            }
         ]
      }
   }

   return trafficSplitObject
}

export function getStableSMIServiceResource(
   inputObject: K8sObject,
): K8sObject {
   const newObject = JSON.parse(JSON.stringify(inputObject)) 
   // adding stable suffix to service name
   newObject.metadata.name = getBlueGreenResourceName(
      inputObject.metadata.name,
      STABLE_SUFFIX
   )
   return getNewBlueGreenObject(newObject, NONE_LABEL_VALUE)
   
}


export function getGreenSMIServiceResource(
   inputObject: K8sObject,
): K8sObject {
   const newObject = JSON.parse(JSON.stringify(inputObject))
   return getNewBlueGreenObject(newObject, GREEN_LABEL_VALUE)
   
   
}

export async function validateTrafficSplitsState(
   kubectl: Kubectl,
   serviceEntityList: any[]
): Promise<boolean> {
   let trafficSplitsInRightState: boolean = true

   for (const serviceObject of serviceEntityList) {
      const name = serviceObject.metadata.name
      let trafficSplitObject = await fetchResource(
         kubectl,
         TRAFFIC_SPLIT_OBJECT,
         getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX)
      )

      if (!trafficSplitObject) {
         core.debug("no traffic split exits for " + name)
         trafficSplitsInRightState = false
         continue
      }

      trafficSplitObject.spec.backends.forEach((element) => {
         // checking if trafficsplit in right state to deploy
         if (element.service === getBlueGreenResourceName(name, GREEN_SUFFIX)) {
            trafficSplitsInRightState = trafficSplitsInRightState && element.weight == MAX_VAL
         }

         if (
            element.service === getBlueGreenResourceName(name, STABLE_SUFFIX)
         ) {
            trafficSplitsInRightState = trafficSplitsInRightState && element.weight == MIN_VAL
         }
      })
   }
   core.debug("returning " + String(trafficSplitsInRightState))
   return trafficSplitsInRightState
}

export async function cleanupSMI(kubectl: Kubectl, serviceEntityList: any[]): Promise<K8sDeleteObject[]> {
   const deleteList: K8sDeleteObject[] = []

   serviceEntityList.forEach((serviceObject) => {
      deleteList.push({
         name: getBlueGreenResourceName(
            serviceObject.metadata.name,
            TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX
         ),
         kind: TRAFFIC_SPLIT_OBJECT
      })

      deleteList.push({
         name: getBlueGreenResourceName(
            serviceObject.metadata.name,
            GREEN_SUFFIX
         ),
         kind: serviceObject.kind
      })

      deleteList.push({
         name: getBlueGreenResourceName(
            serviceObject.metadata.name,
            STABLE_SUFFIX
         ),
         kind: serviceObject.kind
      })
   })

   // delete all objects
   await deleteObjects(kubectl, deleteList)

   return deleteList
}
