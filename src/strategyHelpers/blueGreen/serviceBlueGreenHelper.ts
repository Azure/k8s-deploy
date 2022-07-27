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


// add green labels to configure existing service
export function getUpdatedBlueGreenService(
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
