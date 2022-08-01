import * as core from '@actions/core'
import * as fs from 'fs'
import * as yaml from 'js-yaml'

import { DeployResult } from '../../types/deployResult'
import { K8sObject } from '../../types/k8sObject'
import {Kubectl} from '../../types/kubectl'
import {
   isDeploymentEntity,
   isIngressEntity,
   isServiceEntity,
   KubernetesWorkload
} from '../../types/kubernetesTypes'
import * as fileHelper from '../../utilities/fileUtils'
import {updateSpecLabels} from '../../utilities/manifestSpecLabelUtils'
import {checkForErrors} from '../../utilities/kubectlUtils'
import {
   UnsetClusterSpecificDetails,
   updateObjectLabels,
   updateSelectorLabels
} from '../../utilities/manifestUpdateUtils'


export const GREEN_LABEL_VALUE = 'green'
export const NONE_LABEL_VALUE = 'None'
export const BLUE_GREEN_VERSION_LABEL = 'k8s.deploy.color'
export const GREEN_SUFFIX = '-green'
export const STABLE_SUFFIX = '-stable'

export interface BlueGreenDeployment{
   deployResult: DeployResult,
   objects: K8sObject[]
}

export interface BlueGreenManifests {
   serviceEntityList: K8sObject[]
   serviceNameMap: Map<string, string>
   unroutedServiceEntityList: K8sObject[]
   deploymentEntityList: K8sObject[]
   ingressEntityList: K8sObject[]
   otherObjects: K8sObject[]
}

export async function deleteGreenObjects(
   kubectl: Kubectl,
   toDeleteList: any[]
): Promise<K8sObject[]> {
   const resourcesToDelete = []
   toDeleteList.forEach((inputObject) => {
      const name = inputObject.metadata.name
      const kind = inputObject.kind

      // delete new green deployments
      const resourceToDelete = {
         name: getBlueGreenResourceName(name, GREEN_SUFFIX),
         kind: kind
      }
      resourcesToDelete.push(resourceToDelete)
   })

   await deleteObjects(kubectl, resourcesToDelete)
   return resourcesToDelete
}


export async function deleteObjects(kubectl: Kubectl, deleteList: any[]) {
   // delete services and deployments
   for (const delObject of deleteList) {
      try {
         const result = await kubectl.delete([delObject.kind, delObject.name])
         checkForErrors([result])
      } catch (ex) {
         core.debug("failed to delete object " + delObject?.metadata?.name)
      }
   }
}

// other common functions
export function getManifestObjects(filePaths: string[]): BlueGreenManifests {
   const deploymentEntityList: K8sObject[] = []
   const routedServiceEntityList: K8sObject[] = []
   const unroutedServiceEntityList: K8sObject[] = []
   const ingressEntityList: K8sObject[] = []
   const otherEntitiesList: K8sObject[] = []
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

   return serviceSelector && deploymentEntityList.some((depObject) => {
            // finding if there is a deployment in the given manifests the service targets
            const matchLabels: any = getDeploymentMatchLabels(depObject)
            return (
               matchLabels &&
               isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels)
            )
         })
}

export async function deployWithLabel(
   kubectl: Kubectl,
   deploymentObjectList: any[],
   nextLabel: string
): Promise<BlueGreenDeployment> {
   const newObjectsList = []
   deploymentObjectList.forEach((inputObject) => {
      // creating deployment with label
      const newBlueGreenObject = getNewBlueGreenObject(inputObject, nextLabel)
      newObjectsList.push(newBlueGreenObject)
   })
   core.debug("objects deployed with label are " + JSON.stringify(newObjectsList))
   let deployResult = await deployObjects(kubectl, newObjectsList)
   return {deployResult, objects: newObjectsList}
}

export function getNewBlueGreenObject(
   inputObject: any,
   labelValue: string
): K8sObject {
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

   // updating spec labels if it is not a service
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

export async function deployObjects(kubectl: Kubectl, objectsList: any[]): Promise<DeployResult> {
   const manifestFiles = fileHelper.writeObjectsToFile(objectsList)
   const result = await kubectl.apply(manifestFiles)

   return {result, manifestFiles}
}




