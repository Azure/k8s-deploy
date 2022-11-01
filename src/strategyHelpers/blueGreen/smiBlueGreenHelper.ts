import * as core from '@actions/core'
import {Kubectl} from '../../types/kubectl'
import * as kubectlUtils from '../../utilities/trafficSplitUtils'
import {
   deleteObjects,
   deployObjects,
   fetchResource,
   getBlueGreenResourceName,
   getNewBlueGreenObject,
   GREEN_LABEL_VALUE,
   GREEN_SUFFIX,
   NONE_LABEL_VALUE,
   STABLE_SUFFIX
} from './blueGreenHelper'
import {BlueGreenDeployment} from '../../types/blueGreenTypes'
import {
   K8sDeleteObject,
   K8sObject,
   TrafficSplitObject
} from '../../types/k8sObject'
import {DeployResult} from '../../types/deployResult'
import {inputAnnotations} from '../../inputUtils'

export const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = '-trafficsplit'
export const TRAFFIC_SPLIT_OBJECT = 'TrafficSplit'
export const MIN_VAL = 0
export const MAX_VAL = 100

export async function setupSMI(
   kubectl: Kubectl,
   serviceEntityList: any[]
): Promise<BlueGreenDeployment> {
   const newObjectsList = []
   const trafficObjectList = []

   serviceEntityList.forEach((serviceObject) => {
      // create a trafficsplit for service
      trafficObjectList.push(serviceObject)
      // set up the services for trafficsplit
      const newStableService = getStableSMIServiceResource(serviceObject)
      const newGreenService = getGreenSMIServiceResource(serviceObject)
      newObjectsList.push(newStableService)
      newObjectsList.push(newGreenService)
   })

   const tsObjects: TrafficSplitObject[] = []
   // route to stable service
   for (const svc of trafficObjectList) {
      const tsObject = await createTrafficSplitObject(
         kubectl,
         svc.metadata.name,
         NONE_LABEL_VALUE
      )
      tsObjects.push(tsObject as TrafficSplitObject)
   }

   const objectsToDeploy = [].concat(newObjectsList, tsObjects)

   // create services
   const smiDeploymentResult: DeployResult = await deployObjects(
      kubectl,
      objectsToDeploy
   )

   return {
      objects: objectsToDeploy,
      deployResult: smiDeploymentResult
   }
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

   // retrieve annotations for TS object
   const annotations = inputAnnotations

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
         annotations: annotations,
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

export function getStableSMIServiceResource(inputObject: K8sObject): K8sObject {
   const newObject = JSON.parse(JSON.stringify(inputObject))
   // adding stable suffix to service name
   newObject.metadata.name = getBlueGreenResourceName(
      inputObject.metadata.name,
      STABLE_SUFFIX
   )
   return getNewBlueGreenObject(newObject, NONE_LABEL_VALUE)
}

export function getGreenSMIServiceResource(inputObject: K8sObject): K8sObject {
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
      core.debug(
         `ts object extracted was ${JSON.stringify(trafficSplitObject)}`
      )
      if (!trafficSplitObject) {
         core.debug(`no traffic split exits for ${name}`)
         trafficSplitsInRightState = false
         continue
      }

      trafficSplitObject.spec.backends.forEach((element) => {
         // checking if trafficsplit in right state to deploy
         if (element.service === getBlueGreenResourceName(name, GREEN_SUFFIX)) {
            trafficSplitsInRightState =
               trafficSplitsInRightState && element.weight == MAX_VAL
         }

         if (
            element.service === getBlueGreenResourceName(name, STABLE_SUFFIX)
         ) {
            trafficSplitsInRightState =
               trafficSplitsInRightState && element.weight == MIN_VAL
         }
      })
   }
   return trafficSplitsInRightState
}

export async function cleanupSMI(
   kubectl: Kubectl,
   serviceEntityList: any[]
): Promise<K8sDeleteObject[]> {
   const deleteList: K8sDeleteObject[] = []

   serviceEntityList.forEach((serviceObject) => {
      deleteList.push({
         name: getBlueGreenResourceName(
            serviceObject.metadata.name,
            GREEN_SUFFIX
         ),
         kind: serviceObject.kind
      })
   })

   // delete all objects
   await deleteObjects(kubectl, deleteList)

   return deleteList
}
