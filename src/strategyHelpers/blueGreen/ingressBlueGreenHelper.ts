import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import {
   addBlueGreenLabelsAndAnnotations,
} from './blueGreenHelper'
import * as core from '@actions/core'

const BACKEND = 'backend'


export function getUpdatedBlueGreenIngress(
   inputObject: any,
   serviceNameMap: Map<string, string>,
   type: string
): object {
   if (!type) {
      return inputObject
   }

   const newObject = JSON.parse(JSON.stringify(inputObject))
   // add green labels and values
   addBlueGreenLabelsAndAnnotations(newObject, type)

   // update ingress labels
   if(inputObject.apiVersion === "networking.k8s.io/v1beta1"){
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
      if (key.toLowerCase() === BACKEND && serviceNameMap.has(value.service.name)) {
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

      isIngressRouted = isIngressRouted || (key === 'service' && value.hasOwnProperty('name'))
      isIngressRouted = isIngressRouted || (key === 'serviceName' && serviceNameMap.has(value))
      
      return value
   })

   return isIngressRouted
}