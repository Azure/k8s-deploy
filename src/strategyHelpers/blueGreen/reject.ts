import {K8sDeleteObject} from '../../types/k8sObject'
import {Kubectl} from '../../types/kubectl'
import {
   BlueGreenDeployment,
   BlueGreenManifests,
   deleteGreenObjects,
   NONE_LABEL_VALUE
} from './blueGreenHelper'

import {routeBlueGreenSMI} from './route'

import {cleanupSMI} from './smiBlueGreenHelper'

export interface RejectResult {
   deleteResult: K8sDeleteObject[]
   routeResult: BlueGreenDeployment
}

import {routeBlueGreenIngressUnchanged, routeBlueGreenService} from './route'

export async function rejectBlueGreenIngress(
   kubectl: Kubectl,
   manifestObjects: BlueGreenManifests
): Promise<RejectResult> {
   // get all kubernetes objects defined in manifest files
   // route ingress to stables services
   const routeResult = await routeBlueGreenIngressUnchanged(
      kubectl,
      manifestObjects.serviceNameMap,
      manifestObjects.ingressEntityList
   )

   // delete green services and deployments
   const deleteResult = await deleteGreenObjects(
      kubectl,
      [].concat(
         manifestObjects.deploymentEntityList,
         manifestObjects.serviceEntityList
      )
   )

   return {routeResult, deleteResult}
}

export async function rejectBlueGreenService(
   kubectl: Kubectl,
   manifestObjects: BlueGreenManifests
): Promise<RejectResult> {
   // route to stable objects
   const routeResult = await routeBlueGreenService(
      kubectl,
      NONE_LABEL_VALUE,
      manifestObjects.serviceEntityList
   )

   // delete new deployments with green suffix
   const deleteResult = await deleteGreenObjects(
      kubectl,
      manifestObjects.deploymentEntityList
   )

   return {routeResult, deleteResult}
}

export async function rejectBlueGreenSMI(
   kubectl: Kubectl,
   manifestObjects: BlueGreenManifests
): Promise<RejectResult> {
   // route trafficsplit to stable deployments
   const routeResult = await routeBlueGreenSMI(
      kubectl,
      NONE_LABEL_VALUE,
      manifestObjects.serviceEntityList
   )

   // delete rejected new bluegreen deployments
   const deletedObjects = await deleteGreenObjects(
      kubectl,
      manifestObjects.deploymentEntityList
   )

   // delete trafficsplit and extra services
   const cleanupResult = await cleanupSMI(
      kubectl,
      manifestObjects.serviceEntityList
   )

   return {routeResult, deleteResult: [].concat(deletedObjects, cleanupResult)}
}
