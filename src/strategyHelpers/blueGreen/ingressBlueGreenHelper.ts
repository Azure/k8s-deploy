import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import {
   addBlueGreenLabelsAndAnnotations,
   BLUE_GREEN_VERSION_LABEL,
   BlueGreenManifests,
   createWorkloadsWithLabel,
   deleteWorkloadsAndServicesWithLabel,
   fetchResource,
   getManifestObjects,
   getNewBlueGreenObject,
   GREEN_LABEL_VALUE,
   NONE_LABEL_VALUE
} from './blueGreenHelper'
import * as core from '@actions/core'

const BACKEND = 'backend'

export async function deployBlueGreenIngress(
   kubectl: Kubectl,
   filePaths: string[]
) {
   // get all kubernetes objects defined in manifest files
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // create deployments with green label value
   const result = await createWorkloadsWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      GREEN_LABEL_VALUE
   )
   // refactor - wrap services deployment into its own function
   // create new services and other objects
   let newObjectsList = []
   manifestObjects.serviceEntityList.forEach((inputObject) => {
      const newBlueGreenObject = getNewBlueGreenObject(
         inputObject,
         GREEN_LABEL_VALUE
      )
      newObjectsList.push(newBlueGreenObject)
   })
   newObjectsList = newObjectsList
      .concat(manifestObjects.otherObjects)
      .concat(manifestObjects.unroutedServiceEntityList)
   
   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   await kubectl.apply(manifestFiles)

   core.debug('new objects after processing services and other objects: \n' + JSON.stringify(newObjectsList))

   return {result, newObjectsList}
}

export async function promoteBlueGreenIngress(
   kubectl: Kubectl,
   manifestObjects
) {
   //checking if anything to promote
   var {areValid, invalidIngresses} = validateIngresses(
      kubectl,
      manifestObjects.ingressEntityList,
      manifestObjects.serviceNameMap
   )
   if (!areValid) {
      throw 'Ingresses are not in promote state' + invalidIngresses.toString()
   }

   // create stable deployments with new configuration
   const result = createWorkloadsWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      NONE_LABEL_VALUE
   )

   // refactor - separate function call to maintain some logical pattern - have deployments happen in some extenral call rather than right here, just like
   // is done for deployments
   // create stable services with new configuration
   const newObjectsList = []
   manifestObjects.serviceEntityList.forEach((inputObject) => {
      const newBlueGreenObject = getNewBlueGreenObject(
         inputObject,
         NONE_LABEL_VALUE
      )
      newObjectsList.push(newBlueGreenObject)
   })

   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   await kubectl.apply(manifestFiles)

   return result
}

export async function rejectBlueGreenIngress(
   kubectl: Kubectl,
   filePaths: string[]
) {
   // get all kubernetes objects defined in manifest files
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // route ingress to stables services
   await routeBlueGreenIngress(
      kubectl,
      null,
      manifestObjects.serviceNameMap,
      manifestObjects.ingressEntityList
   )

   // delete green services and deployments
   await deleteWorkloadsAndServicesWithLabel(
      kubectl,
      GREEN_LABEL_VALUE,
      manifestObjects.deploymentEntityList,
      manifestObjects.serviceEntityList
   )
}

export async function routeBlueGreenIngress(
   kubectl: Kubectl,
   nextLabel: string,
   serviceNameMap: Map<string, string>,
   ingressEntityList: any[]
) {
   let newObjectsList = []

   // refactor - should have a separate function to to deploy ingresses when we don't want to update them
   if (!nextLabel) {
      newObjectsList = ingressEntityList.filter((ingress) =>
         isIngressRouted(ingress, serviceNameMap)
      )
   } else {
      // refactor - confusing pattern - just have one function handle processing AND deployment, something like deployBlueGreenIngresses
      ingressEntityList.forEach((inputObject) => {
         if (isIngressRouted(inputObject, serviceNameMap)) {
            const newBlueGreenIngressObject = getUpdatedBlueGreenIngress(
               inputObject,
               serviceNameMap,
               GREEN_LABEL_VALUE
            )
            newObjectsList.push(newBlueGreenIngressObject)
         } else {
            newObjectsList.push(inputObject)
         }
      })
   }

   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   await kubectl.apply(manifestFiles)
   return newObjectsList
}

export function validateIngresses(
   kubectl: Kubectl,
   ingressEntityList: any[],
   serviceNameMap: Map<string, string>
): {areValid: boolean, invalidIngresses: string[]} {
   let areValid: boolean = true
   const invalidIngresses = []
   ingressEntityList.forEach(async (inputObject) => {
      if (isIngressRouted(inputObject, serviceNameMap)) {
         //querying existing ingress
         const existingIngress = await fetchResource(
            kubectl,
            inputObject.kind,
            inputObject.metadata.name
         )

         var isValid = !!existingIngress && existingIngress?.metadata?.labels[BLUE_GREEN_VERSION_LABEL] === GREEN_LABEL_VALUE 
         if (!isValid){
            invalidIngresses.push(inputObject.metadata.name)
         }
         // to be valid, ingress should exist and should be green
         areValid = areValid && isValid

      }
   })

   return {areValid, invalidIngresses}
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