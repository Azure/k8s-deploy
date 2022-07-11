import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import {
   addBlueGreenLabelsAndAnnotations,
   BLUE_GREEN_VERSION_LABEL,
   BlueGreenManifests,
   createWorkloadsWithLabel,
   deleteWorkloadsWithLabel,
   fetchResource,
   getManifestObjects,
   GREEN_LABEL_VALUE,
   NONE_LABEL_VALUE
} from './blueGreenHelper'

export async function deployBlueGreenService(
   kubectl: Kubectl,
   filePaths: string[]
) {
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // create deployments with green label value
   const result = await createWorkloadsWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      GREEN_LABEL_VALUE
   )

   // create other non deployment and non service entities
   const newObjectsList = manifestObjects.otherObjects
      .concat(manifestObjects.ingressEntityList)
      .concat(manifestObjects.unroutedServiceEntityList)
   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   if (manifestFiles.length > 0) await kubectl.apply(manifestFiles)

   // returning deployment details to check for rollout stability
   return result
}

export async function promoteBlueGreenService(
   kubectl: Kubectl,
   manifestObjects
) {
   // checking if services are in the right state ie. targeting green deployments
   if (
      !(await validateServicesState(kubectl, manifestObjects.serviceEntityList))
   ) {
      throw 'Not inP promote state'
   }

   // creating stable deployments with new configurations
   return await createWorkloadsWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      NONE_LABEL_VALUE
   )
}

export async function rejectBlueGreenService(
   kubectl: Kubectl,
   filePaths: string[]
) {
   // get all kubernetes objects defined in manifest files
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // route to stable objects
   await routeBlueGreenService(
      kubectl,
      NONE_LABEL_VALUE,
      manifestObjects.serviceEntityList
   )

   // delete new deployments with green suffix
   await deleteWorkloadsWithLabel(
      kubectl,
      GREEN_LABEL_VALUE,
      manifestObjects.deploymentEntityList
   )
}

export async function routeBlueGreenService(
   kubectl: Kubectl,
   nextLabel: string,
   serviceEntityList: any[]
) {
   const newObjectsList = []
   serviceEntityList.forEach((serviceObject) => {
      const newBlueGreenServiceObject = getUpdatedBlueGreenService(
         serviceObject,
         nextLabel
      )
      newObjectsList.push(newBlueGreenServiceObject)
   })

   // configures the services
   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   await kubectl.apply(manifestFiles)
}

// add green labels to configure existing service
function getUpdatedBlueGreenService(
   inputObject: any,
   labelValue: string
): object {
   const newObject = JSON.parse(JSON.stringify(inputObject))

   // Adding labels and annotations.
   addBlueGreenLabelsAndAnnotations(newObject, labelValue)
   return newObject
}

export async function validateServicesState(
   kubectl: Kubectl,
   serviceEntityList: any[]
): Promise<boolean> {
   let areServicesGreen: boolean = true

   for (const serviceObject of serviceEntityList) {
      // finding the existing routed service
      const existingService = await fetchResource(
         kubectl,
         serviceObject.kind,
         serviceObject.metadata.name
      )

      if (!!existingService) {
         const currentLabel: string = getServiceSpecLabel(existingService)
         if (currentLabel != GREEN_LABEL_VALUE) {
            // service should be targeting deployments with green label
            areServicesGreen = false
         }
      } else {
         // service targeting deployment doesn't exist
         areServicesGreen = false
      }
   }

   return areServicesGreen
}

export function getServiceSpecLabel(inputObject: any): string {
   if (inputObject?.spec?.selector[BLUE_GREEN_VERSION_LABEL]) {
      return inputObject.spec.selector[BLUE_GREEN_VERSION_LABEL]
   }

   return ''
}
