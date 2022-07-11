import {Kubectl} from '../../types/kubectl'
import * as kubectlUtils from '../../utilities/trafficSplitUtils'
import * as fileHelper from '../../utilities/fileUtils'
import {
   BlueGreenManifests,
   createWorkloadsWithLabel,
   deleteObjects,
   deleteWorkloadsWithLabel,
   fetchResource,
   getBlueGreenResourceName,
   getManifestObjects,
   getNewBlueGreenObject,
   GREEN_LABEL_VALUE,
   GREEN_SUFFIX,
   NONE_LABEL_VALUE,
   STABLE_SUFFIX
} from './blueGreenHelper'

const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = '-trafficsplit'
const TRAFFIC_SPLIT_OBJECT = 'TrafficSplit'
const MIN_VAL = 0
const MAX_VAL = 100

export async function deployBlueGreenSMI(
   kubectl: Kubectl,
   filePaths: string[]
) {
   // get all kubernetes objects defined in manifest files
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // create services and other objects
   const newObjectsList = manifestObjects.otherObjects
      .concat(manifestObjects.serviceEntityList)
      .concat(manifestObjects.ingressEntityList)
      .concat(manifestObjects.unroutedServiceEntityList)
   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   await kubectl.apply(manifestFiles)

   // make extraservices and trafficsplit
   await setupSMI(kubectl, manifestObjects.serviceEntityList)

   // create new deloyments
   return await createWorkloadsWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      GREEN_LABEL_VALUE
   )
}

export async function promoteBlueGreenSMI(kubectl: Kubectl, manifestObjects) {
   // checking if there is something to promote
   if (
      !(await validateTrafficSplitsState(
         kubectl,
         manifestObjects.serviceEntityList
      ))
   ) {
      throw Error('Not in promote state SMI')
   }

   // create stable deployments with new configuration
   return await createWorkloadsWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      NONE_LABEL_VALUE
   )
}

export async function rejectBlueGreenSMI(
   kubectl: Kubectl,
   filePaths: string[]
) {
   // get all kubernetes objects defined in manifest files
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // route trafficsplit to stable deploymetns
   await routeBlueGreenSMI(
      kubectl,
      NONE_LABEL_VALUE,
      manifestObjects.serviceEntityList
   )

   // delete rejected new bluegreen deployments
   await deleteWorkloadsWithLabel(
      kubectl,
      GREEN_LABEL_VALUE,
      manifestObjects.deploymentEntityList
   )

   // delete trafficsplit and extra services
   await cleanupSMI(kubectl, manifestObjects.serviceEntityList)
}

export async function setupSMI(kubectl: Kubectl, serviceEntityList: any[]) {
   const newObjectsList = []
   const trafficObjectList = []

   serviceEntityList.forEach((serviceObject) => {
      // create a trafficsplit for service
      trafficObjectList.push(serviceObject)
      // set up the services for trafficsplit
      const newStableService = getSMIServiceResource(
         serviceObject,
         STABLE_SUFFIX
      )
      const newGreenService = getSMIServiceResource(serviceObject, GREEN_SUFFIX)
      newObjectsList.push(newStableService)
      newObjectsList.push(newGreenService)
   })

   // create services
   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   await kubectl.apply(manifestFiles)

   // route to stable service
   trafficObjectList.forEach((inputObject) => {
      createTrafficSplitObject(
         kubectl,
         inputObject.metadata.name,
         NONE_LABEL_VALUE
      )
   })
}

let trafficSplitAPIVersion = ''

async function createTrafficSplitObject(
   kubectl: Kubectl,
   name: string,
   nextLabel: string
): Promise<any> {
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

   const trafficSplitObject = JSON.stringify({
      apiVersion: trafficSplitAPIVersion,
      kind: 'TrafficSplit',
      metadata: {
         name: getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX)
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
   })

   // create traffic split object
   const trafficSplitManifestFile = fileHelper.writeManifestToFile(
      trafficSplitObject,
      TRAFFIC_SPLIT_OBJECT,
      getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX)
   )

   await kubectl.apply(trafficSplitManifestFile)
}

export function getSMIServiceResource(
   inputObject: any,
   suffix: string
): object {
   const newObject = JSON.parse(JSON.stringify(inputObject))

   if (suffix === STABLE_SUFFIX) {
      // adding stable suffix to service name
      newObject.metadata.name = getBlueGreenResourceName(
         inputObject.metadata.name,
         STABLE_SUFFIX
      )
      return getNewBlueGreenObject(newObject, NONE_LABEL_VALUE)
   } else {
      // green label will be added for these
      return getNewBlueGreenObject(newObject, GREEN_LABEL_VALUE)
   }
}

export async function routeBlueGreenSMI(
   kubectl: Kubectl,
   nextLabel: string,
   serviceEntityList: any[]
) {
   for (const serviceObject of serviceEntityList) {
      // route trafficsplit to given label
      await createTrafficSplitObject(
         kubectl,
         serviceObject.metadata.name,
         nextLabel
      )
   }
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
         // no traffic split exits
         trafficSplitsInRightState = false
      }

      trafficSplitObject = JSON.parse(JSON.stringify(trafficSplitObject))
      trafficSplitObject.spec.backends.forEach((element) => {
         // checking if trafficsplit in right state to deploy
         if (element.service === getBlueGreenResourceName(name, GREEN_SUFFIX)) {
            if (element.weight != MAX_VAL) trafficSplitsInRightState = false
         }

         if (
            element.service === getBlueGreenResourceName(name, STABLE_SUFFIX)
         ) {
            if (element.weight != MIN_VAL) trafficSplitsInRightState = false
         }
      })
   }

   return trafficSplitsInRightState
}

export async function cleanupSMI(kubectl: Kubectl, serviceEntityList: any[]) {
   const deleteList = []

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
}
