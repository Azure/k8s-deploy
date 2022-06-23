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

const BACKEND = 'BACKEND'

export async function deployBlueGreenIngress(
   kubectl: Kubectl,
   filePaths: string[]
) {
   // get all kubernetes objects defined in manifest files
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // create deployments with green label value
   const result = createWorkloadsWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      GREEN_LABEL_VALUE
   )

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

   return result
}

export async function promoteBlueGreenIngress(
   kubectl: Kubectl,
   manifestObjects
) {
   //checking if anything to promote
   if (
      !validateIngressesState(
         kubectl,
         manifestObjects.ingressEntityList,
         manifestObjects.serviceNameMap
      )
   ) {
      throw 'Ingress not in promote state'
   }

   // create stable deployments with new configuration
   const result = createWorkloadsWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      NONE_LABEL_VALUE
   )

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

   if (!nextLabel) {
      newObjectsList = ingressEntityList.filter((ingress) =>
         isIngressRouted(ingress, serviceNameMap)
      )
   } else {
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

   core.debug('New objects: ' + JSON.stringify(newObjectsList))
   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   await kubectl.apply(manifestFiles)
}

export function validateIngressesState(
   kubectl: Kubectl,
   ingressEntityList: any[],
   serviceNameMap: Map<string, string>
): boolean {
   let areIngressesTargetingNewServices: boolean = true
   ingressEntityList.forEach(async (inputObject) => {
      if (isIngressRouted(inputObject, serviceNameMap)) {
         //querying existing ingress
         const existingIngress = await fetchResource(
            kubectl,
            inputObject.kind,
            inputObject.metadata.name
         )

         if (!!existingIngress) {
            const currentLabel: string =
               existingIngress?.metadata?.labels[BLUE_GREEN_VERSION_LABEL]

            // if not green label, then wrong configuration
            if (currentLabel != GREEN_LABEL_VALUE)
               areIngressesTargetingNewServices = false
         } else {
            // no ingress at all, so nothing to promote
            areIngressesTargetingNewServices = false
         }
      }
   })

   return areIngressesTargetingNewServices
}

function isIngressRouted(
   ingressObject: any,
   serviceNameMap: Map<string, string>
): boolean {
   let isIngressRouted: boolean = false
   // check if ingress targets a service in the given manifests
   JSON.parse(JSON.stringify(ingressObject), (key, value) => {
      if (key === 'serviceName' && serviceNameMap.has(value)) {
         isIngressRouted = true
      }

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
   return updateIngressBackend(newObject, serviceNameMap)
}

export function updateIngressBackend(
   inputObject: any,
   serviceNameMap: Map<string, string>
): any {
   inputObject = JSON.parse(JSON.stringify(inputObject), (key, value) => {
      if (key.toUpperCase() === BACKEND) {
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
