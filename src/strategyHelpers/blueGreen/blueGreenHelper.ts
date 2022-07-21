import * as core from '@actions/core'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import {Kubectl} from '../../types/kubectl'
import {
   isDeploymentEntity,
   isIngressEntity,
   isServiceEntity,
   KubernetesWorkload
} from '../../types/kubernetesTypes'
import * as fileHelper from '../../utilities/fileUtils'
import {routeBlueGreenService} from './serviceBlueGreenHelper'
import {routeBlueGreenIngress} from './ingressBlueGreenHelper'
import {routeBlueGreenSMI} from './smiBlueGreenHelper'
import {
   UnsetClusterSpecificDetails,
   updateObjectLabels,
   updateSelectorLabels
} from '../../utilities/manifestUpdateUtils'
import {updateSpecLabels} from '../../utilities/manifestSpecLabelUtils'
import {checkForErrors} from '../../utilities/kubectlUtils'
import {sleep} from '../../utilities/timeUtils'
import {RouteStrategy} from '../../types/routeStrategy'

export const GREEN_LABEL_VALUE = 'green'
export const NONE_LABEL_VALUE = 'None'
export const BLUE_GREEN_VERSION_LABEL = 'k8s.deploy.color'
export const GREEN_SUFFIX = '-green'
export const STABLE_SUFFIX = '-stable'

export interface BlueGreenManifests {
   serviceEntityList: any[]
   serviceNameMap: Map<string, string>
   unroutedServiceEntityList: any[]
   deploymentEntityList: any[]
   ingressEntityList: any[]
   otherObjects: any[]
}

export async function routeBlueGreen(
   kubectl: Kubectl,
   inputManifestFiles: string[],
   routeStrategy: RouteStrategy
) {
   // sleep for buffer time
   const bufferTime: number = parseInt(
      core.getInput('version-switch-buffer') || '0'
   )
   if (bufferTime < 0 || bufferTime > 300)
      throw Error('Version switch buffer must be between 0 and 300 (inclusive)')
   const startSleepDate = new Date()
   core.info(
      `Starting buffer time of ${bufferTime} minute(s) at ${startSleepDate.toISOString()}`
   )
   await sleep(bufferTime * 1000 * 60)
   const endSleepDate = new Date()
   core.info(
      `Stopping buffer time of ${bufferTime} minute(s) at ${endSleepDate.toISOString()}`
   )

   const manifestObjects: BlueGreenManifests =
      getManifestObjects(inputManifestFiles)
   core.debug('Manifest objects: ' + JSON.stringify(manifestObjects))

   // route to new deployments
   if (routeStrategy == RouteStrategy.INGRESS) {
      await routeBlueGreenIngress(
         kubectl,
         GREEN_LABEL_VALUE,
         manifestObjects.serviceNameMap,
         manifestObjects.ingressEntityList
      )
   } else if (routeStrategy == RouteStrategy.SMI) {
      await routeBlueGreenSMI(
         kubectl,
         GREEN_LABEL_VALUE,
         manifestObjects.serviceEntityList
      )
   } else {
      await routeBlueGreenService(
         kubectl,
         GREEN_LABEL_VALUE,
         manifestObjects.serviceEntityList
      )
   }
}

export async function deleteWorkloadsWithLabel(
   kubectl: Kubectl,
   deleteLabel: string,
   deploymentEntityList: any[]
) {
   const resourcesToDelete = []
   deploymentEntityList.forEach((inputObject) => {
      const name = inputObject.metadata.name
      const kind = inputObject.kind

      if (deleteLabel === NONE_LABEL_VALUE) {
         // delete stable deployments
         const resourceToDelete = {name, kind}
         resourcesToDelete.push(resourceToDelete)
      } else {
         // delete new green deployments
         const resourceToDelete = {
            name: getBlueGreenResourceName(name, GREEN_SUFFIX),
            kind: kind
         }
         resourcesToDelete.push(resourceToDelete)
      }
   })

   await deleteObjects(kubectl, resourcesToDelete)
}

export async function deleteWorkloadsAndServicesWithLabel(
   kubectl: Kubectl,
   deleteLabel: string,
   deploymentEntityList: any[],
   serviceEntityList: any[]
) {
   // need to delete services and deployments
   const deletionEntitiesList = deploymentEntityList.concat(serviceEntityList)
   const resourcesToDelete = []

   deletionEntitiesList.forEach((inputObject) => {
      const name = inputObject.metadata.name
      const kind = inputObject.kind

      if (deleteLabel === NONE_LABEL_VALUE) {
         // delete stable objects
         const resourceToDelete = {name, kind}
         resourcesToDelete.push(resourceToDelete)
      } else {
         // delete green labels
         const resourceToDelete = {
            name: getBlueGreenResourceName(name, GREEN_SUFFIX),
            kind: kind
         }
         resourcesToDelete.push(resourceToDelete)
      }
   })

   await deleteObjects(kubectl, resourcesToDelete)
}

export async function deleteObjects(kubectl: Kubectl, deleteList: any[]) {
   // delete services and deployments
   for (const delObject of deleteList) {
      try {
         const result = await kubectl.delete([delObject.kind, delObject.name])
         checkForErrors([result])
      } catch (ex) {
         // Ignore failures of delete if it doesn't exist
      }
   }
}

// other common functions
export function getManifestObjects(filePaths: string[]): BlueGreenManifests {
   const deploymentEntityList = []
   const routedServiceEntityList = []
   const unroutedServiceEntityList = []
   const ingressEntityList = []
   const otherEntitiesList = []
   const serviceNameMap = new Map<string, string>()

   filePaths.forEach((filePath: string) => {
      const fileContents = fs.readFileSync(filePath).toString()
      yaml.safeLoadAll(fileContents, (inputObject) => {
         if (!!inputObject) {
            const kind = inputObject.kind
            const name = inputObject.metadata.name

            if (isDeploymentEntity(kind)) {
               deploymentEntityList.push(inputObject)
            } else if (isServiceEntity(kind)) {
               if (isServiceRouted(inputObject, deploymentEntityList)) {
                  routedServiceEntityList.push(inputObject)
                  serviceNameMap.set(
                     name,
                     getBlueGreenResourceName(name, GREEN_SUFFIX)
                  )
               } else {
                  unroutedServiceEntityList.push(inputObject)
               }
            } else if (isIngressEntity(kind)) {
               ingressEntityList.push(inputObject)
            } else {
               otherEntitiesList.push(inputObject)
            }
         }
      })
   })

   return {
      serviceEntityList: routedServiceEntityList,
      serviceNameMap: serviceNameMap,
      unroutedServiceEntityList: unroutedServiceEntityList,
      deploymentEntityList: deploymentEntityList,
      ingressEntityList: ingressEntityList,
      otherObjects: otherEntitiesList
   }
}

export function isServiceRouted(
   serviceObject: any[],
   deploymentEntityList: any[]
): boolean {
   let shouldBeRouted: boolean = false
   const serviceSelector: any = getServiceSelector(serviceObject)
   if (serviceSelector) {
      if (
         deploymentEntityList.some((depObject) => {
            // finding if there is a deployment in the given manifests the service targets
            const matchLabels: any = getDeploymentMatchLabels(depObject)
            return (
               matchLabels &&
               isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels)
            )
         })
      ) {
         shouldBeRouted = true
      }
   }

   return shouldBeRouted
}

export async function createWorkloadsWithLabel(
   kubectl: Kubectl,
   deploymentObjectList: any[],
   nextLabel: string
) {
   const newObjectsList = []
   deploymentObjectList.forEach((inputObject) => {
      // creating deployment with label
      const newBlueGreenObject = getNewBlueGreenObject(inputObject, nextLabel)
      core.debug(
         'New blue-green object is: ' + JSON.stringify(newBlueGreenObject)
      )
      newObjectsList.push(newBlueGreenObject)
   })

   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   const result = await kubectl.apply(manifestFiles)

   return {result: result, newFilePaths: manifestFiles}
}

export function getNewBlueGreenObject(
   inputObject: any,
   labelValue: string
): object {
   const newObject = JSON.parse(JSON.stringify(inputObject))

   // Updating name only if label is green label is given
   if (labelValue === GREEN_LABEL_VALUE) {
      newObject.metadata.name = getBlueGreenResourceName(
         inputObject.metadata.name,
         GREEN_SUFFIX
      )
   }

   // Adding labels and annotations
   addBlueGreenLabelsAndAnnotations(newObject, labelValue)
   return newObject
}

export function addBlueGreenLabelsAndAnnotations(
   inputObject: any,
   labelValue: string
) {
   //creating the k8s.deploy.color label
   const newLabels = new Map<string, string>()
   newLabels[BLUE_GREEN_VERSION_LABEL] = labelValue

   // updating object labels and selector labels
   updateObjectLabels(inputObject, newLabels, false)
   updateSelectorLabels(inputObject, newLabels, false)

   // updating spec labels if it is a service
   if (!isServiceEntity(inputObject.kind)) {
      updateSpecLabels(inputObject, newLabels, false)
   }
}

export function getBlueGreenResourceName(name: string, suffix: string) {
   return `${name}${suffix}`
}

export function getDeploymentMatchLabels(deploymentObject: any): any {
   if (
      deploymentObject?.kind?.toUpperCase() ==
         KubernetesWorkload.POD.toUpperCase() &&
      deploymentObject?.metadata?.labels
   ) {
      return deploymentObject.metadata.labels
   } else if (deploymentObject?.spec?.selector?.matchLabels) {
      return deploymentObject.spec.selector.matchLabels
   }
}

export function getServiceSelector(serviceObject: any): any {
   if (serviceObject?.spec?.selector) {
      return serviceObject.spec.selector
   }
}

export function isServiceSelectorSubsetOfMatchLabel(
   serviceSelector: any,
   matchLabels: any
): boolean {
   const serviceSelectorMap = new Map()
   const matchLabelsMap = new Map()

   JSON.parse(JSON.stringify(serviceSelector), (key, value) => {
      serviceSelectorMap.set(key, value)
   })

   JSON.parse(JSON.stringify(matchLabels), (key, value) => {
      matchLabelsMap.set(key, value)
   })

   let isMatch = true
   serviceSelectorMap.forEach((value, key) => {
      if (
         !!key &&
         (!matchLabelsMap.has(key) || matchLabelsMap.get(key)) != value
      )
         isMatch = false
   })

   return isMatch
}

export async function fetchResource(
   kubectl: Kubectl,
   kind: string,
   name: string
) {
   const result = await kubectl.getResource(kind, name)
   if (result == null || !!result.stderr) {
      return null
   }

   if (!!result.stdout) {
      const resource = JSON.parse(result.stdout)

      try {
         UnsetClusterSpecificDetails(resource)
         return resource
      } catch (ex) {
         core.debug(
            `Exception occurred while Parsing ${resource} in Json object: ${ex}`
         )
      }
   }
}
