import {Kubectl} from '../../types/kubectl'
import {
   BlueGreenManifests,
   deleteGreenObjects,
   getManifestObjects,
   NONE_LABEL_VALUE
} from './blueGreenHelper'

import {
    routeBlueGreenIngressUnchanged,
    routeBlueGreenService
} from './route'


export async function rejectBlueGreenIngress(
    kubectl: Kubectl,
    filePaths: string[]
 ) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)
 
    // route ingress to stables services
    await routeBlueGreenIngressUnchanged(kubectl, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList)
 
    // delete green services and deployments
    await deleteGreenObjects(
       kubectl,
       manifestObjects.deploymentEntityList.concat(manifestObjects.serviceEntityList)
    )
 }

 export async function rejectBlueGreenService(
    kubectl: Kubectl,
    filePaths: string[]
 ) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)
 
    // route to stable objects
    await routeBlueGreenService(
       kubectl,
       NONE_LABEL_VALUE,
       manifestObjects.serviceEntityList
    )
 
    // delete new deployments with green suffix
    await deleteGreenObjects(
       kubectl,
       manifestObjects.deploymentEntityList
    )
 }
 