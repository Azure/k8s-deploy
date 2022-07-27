import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import {RouteStrategy} from '../../types/routeStrategy'
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
   NONE_LABEL_VALUE,
   deployObjects
} from './blueGreenHelper'

import {getUpdatedBlueGreenIngress, isIngressRouted} from './ingressBlueGreenHelper'
import {getUpdatedBlueGreenService} from './serviceBlueGreenHelper'
import {deployBlueGreenSMI} from './smiBlueGreenHelper'



import * as core from '@actions/core'
import { routeBlueGreenForDeploy } from './route'

export async function deployBlueGreen(
    kubectl: Kubectl,
    files: string[],
    routeStrategy: RouteStrategy
){

    const {result, newFilePaths} = await Promise.resolve(
        (routeStrategy == RouteStrategy.INGRESS &&
           deployBlueGreenIngress(kubectl, files)[0]) || // refactor: why does this need a [0]
           (routeStrategy == RouteStrategy.SMI &&
              deployBlueGreenSMI(kubectl, files)) ||
           deployBlueGreenService(kubectl, files)
     )
        
     core.startGroup('Routing blue green')
     await routeBlueGreenForDeploy(kubectl, files, routeStrategy)
     core.endGroup()

     return {result, newFilePaths}
}

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
    
    deployObjects(kubectl, newObjectsList)
 
    core.debug('new objects after processing services and other objects: \n' + JSON.stringify(newObjectsList))

    return {result, newObjectsList}
 }



 export async function deployBlueGreenService(
    kubectl: Kubectl,
    filePaths: string[]
 ) {
    const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)
 
    // create deployments with green label value
    const result = await createWorkloadsWithLabel(
       kubectl,
       manifestObjects.deploymentEntityList,
       GREEN_LABEL_VALUE
    )
 
    // refactor - see common logic with how this is handled with ingress method as well - 
    // create other non deployment and non service entities
    const newObjectsList = manifestObjects.otherObjects
       .concat(manifestObjects.ingressEntityList)
       .concat(manifestObjects.unroutedServiceEntityList)
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
    
    await kubectl.apply(manifestFiles)
 
    // returning deployment details to check for rollout stability
    return {result, newObjectsList}

    // now route!
 }
 

