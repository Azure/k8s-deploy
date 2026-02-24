import * as core from '@actions/core'
import {K8sServiceObject} from '../../types/k8sObject.js'
import {Kubectl} from '../../types/kubectl.js'
import {
   addBlueGreenLabelsAndAnnotations,
   BLUE_GREEN_VERSION_LABEL,
   fetchResource,
   GREEN_LABEL_VALUE
} from './blueGreenHelper.js'

// add green labels to configure existing service
export function getUpdatedBlueGreenService(
   inputObject: any,
   labelValue: string
): K8sServiceObject {
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
         serviceObject.metadata.name,
         serviceObject?.metadata?.namespace
      )

      let isServiceGreen =
         !!existingService &&
         getServiceSpecLabel(existingService as K8sServiceObject) ==
            GREEN_LABEL_VALUE
      areServicesGreen = areServicesGreen && isServiceGreen
   }

   return areServicesGreen
}

export function getServiceSpecLabel(inputObject: K8sServiceObject): string {
   return inputObject.spec.selector[BLUE_GREEN_VERSION_LABEL]
}
