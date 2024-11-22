import {K8sDeleteObject} from '../../types/k8sObject'
import {Kubectl} from '../../types/kubectl'
import {
   BlueGreenDeployment,
   BlueGreenManifests,
   BlueGreenRejectResult
} from '../../types/blueGreenTypes'
import {deleteGreenObjects, NONE_LABEL_VALUE} from './blueGreenHelper'
import {routeBlueGreenSMI} from './route'
import {cleanupSMI} from './smiBlueGreenHelper'
import {routeBlueGreenIngressUnchanged, routeBlueGreenService} from './route'

export async function rejectBlueGreenIngress(
   kubectl: Kubectl,
   manifestObjects: BlueGreenManifests,
   timeout?: string
): Promise<BlueGreenRejectResult> {
   // get all kubernetes objects defined in manifest files
   // route ingress to stables services
   const routeResult = await routeBlueGreenIngressUnchanged(
      kubectl,
      manifestObjects.serviceNameMap,
      manifestObjects.ingressEntityList,
      timeout
   )

   // delete green services and deployments
   const deleteResult = await deleteGreenObjects(
      kubectl,
      [].concat(
         manifestObjects.deploymentEntityList,
         manifestObjects.serviceEntityList
      ),
      timeout
   )

   return {routeResult, deleteResult}
}

export async function rejectBlueGreenService(
   kubectl: Kubectl,
   manifestObjects: BlueGreenManifests,
   timeout?: string
): Promise<BlueGreenRejectResult> {
   // route to stable objects
   const routeResult = await routeBlueGreenService(
      kubectl,
      NONE_LABEL_VALUE,
      manifestObjects.serviceEntityList,
      timeout
   )

   // delete new deployments with green suffix
   const deleteResult = await deleteGreenObjects(
      kubectl,
      manifestObjects.deploymentEntityList,
      timeout
   )

   return {routeResult, deleteResult}
}

export async function rejectBlueGreenSMI(
   kubectl: Kubectl,
   manifestObjects: BlueGreenManifests,
   timeout?: string
): Promise<BlueGreenRejectResult> {
   // route trafficsplit to stable deployments
   const routeResult = await routeBlueGreenSMI(
      kubectl,
      NONE_LABEL_VALUE,
      manifestObjects.serviceEntityList,
      timeout
   )

   // delete rejected new bluegreen deployments
   const deletedObjects = await deleteGreenObjects(
      kubectl,
      manifestObjects.deploymentEntityList,
      timeout
   )

   // delete trafficsplit and extra services
   const cleanupResult = await cleanupSMI(
      kubectl,
      manifestObjects.serviceEntityList,
      timeout
   )

   return {routeResult, deleteResult: [].concat(deletedObjects, cleanupResult)}
}
