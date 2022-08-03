import {Kubectl} from '../../types/kubectl'
import {
   addBlueGreenLabelsAndAnnotations,
   BLUE_GREEN_VERSION_LABEL,
   fetchResource,
   GREEN_LABEL_VALUE,
} from './blueGreenHelper'



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

      let isServiceGreen = !!existingService && getServiceSpecLabel(existingService) == GREEN_LABEL_VALUE
      areServicesGreen = areServicesGreen && isServiceGreen
   }

   return areServicesGreen
}

export function getServiceSpecLabel(inputObject: any): string {
   if (inputObject?.spec?.selector[BLUE_GREEN_VERSION_LABEL]) {
      return inputObject.spec.selector[BLUE_GREEN_VERSION_LABEL]
   }

   return ''
}
