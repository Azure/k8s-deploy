import * as core from '@actions/core'
import {K8sIngress} from '../../types/k8sObject'
import {
   addBlueGreenLabelsAndAnnotations,
   BLUE_GREEN_VERSION_LABEL,
   GREEN_LABEL_VALUE,
   fetchResource
} from './blueGreenHelper'
import {Kubectl} from '../../types/kubectl'

const BACKEND = 'backend'

export function getUpdatedBlueGreenIngress(
   inputObject: any,
   serviceNameMap: Map<string, string>,
   type: string
): K8sIngress {
   const newObject = JSON.parse(JSON.stringify(inputObject))
   // add green labels and values
   addBlueGreenLabelsAndAnnotations(newObject, type)

   // update ingress labels
   if (inputObject.apiVersion === 'networking.k8s.io/v1beta1') {
      return updateIngressBackendBetaV1(newObject, serviceNameMap)
   }
   return updateIngressBackend(newObject, serviceNameMap)
}

export function updateIngressBackendBetaV1(
   inputObject: any,
   serviceNameMap: Map<string, string>
): any {
   inputObject = JSON.parse(JSON.stringify(inputObject), (key, value) => {
      if (key.toLowerCase() === BACKEND) {
         const {serviceName} = value
         if (serviceNameMap.has(serviceName)) {
            // update service name with corresponding bluegreen name only if service is provied in given manifests
            value.serviceName = serviceNameMap.get(serviceName)
         }
      }

      return value
   })

   return inputObject
}

export function updateIngressBackend(
   inputObject: any,
   serviceNameMap: Map<string, string>
): any {
   inputObject = JSON.parse(JSON.stringify(inputObject), (key, value) => {
      if (
         key.toLowerCase() === BACKEND &&
         serviceNameMap.has(value.service.name)
      ) {
         value.service.name = serviceNameMap.get(value.service.name)
      }
      return value
   })

   return inputObject
}

export function isIngressRouted(
   ingressObject: any,
   serviceNameMap: Map<string, string>
): boolean {
   let isIngressRouted: boolean = false
   // check if ingress targets a service in the given manifests
   JSON.parse(JSON.stringify(ingressObject), (key, value) => {
      isIngressRouted =
         isIngressRouted ||
         (key === 'service' &&
            value.hasOwnProperty('name') &&
            serviceNameMap.has(value.name))
      isIngressRouted =
         isIngressRouted || (key === 'serviceName' && serviceNameMap.has(value))

      return value
   })

   return isIngressRouted
}

export async function validateIngresses(
   kubectl: Kubectl,
   ingressEntityList: any[],
   serviceNameMap: Map<string, string>
): Promise<{areValid: boolean; invalidIngresses: string[]}> {
   let areValid: boolean = true
   const invalidIngresses = []

   for (const inputObject of ingressEntityList) {
      if (isIngressRouted(inputObject, serviceNameMap)) {
         //querying existing ingress
         const existingIngress = await fetchResource(
            kubectl,
            inputObject.kind,
            inputObject.metadata.name
         )

         const isValid =
            !!existingIngress &&
            existingIngress?.metadata?.labels[BLUE_GREEN_VERSION_LABEL] ===
               GREEN_LABEL_VALUE
         if (!isValid) {
            core.debug(
               `Invalid ingress detected (must be in green state): ${JSON.stringify(
                  inputObject
               )}`
            )
            invalidIngresses.push(inputObject.metadata.name)
         }
         // to be valid, ingress should exist and should be green
         areValid = areValid && isValid
      }
   }
   return {areValid, invalidIngresses}
}
