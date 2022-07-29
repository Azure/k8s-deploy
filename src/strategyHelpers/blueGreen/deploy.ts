import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import {RouteStrategy} from '../../types/routeStrategy'
import {
   addBlueGreenLabelsAndAnnotations,
   BLUE_GREEN_VERSION_LABEL,
   BlueGreenManifests,
   deployWithLabel,
   fetchResource,
   getManifestObjects,
   getNewBlueGreenObject,
   GREEN_LABEL_VALUE,
   NONE_LABEL_VALUE,
   deployObjects
} from './blueGreenHelper'

import {getUpdatedBlueGreenIngress, isIngressRouted} from './ingressBlueGreenHelper'
import {getUpdatedBlueGreenService} from './serviceBlueGreenHelper'
import {setupSMI} from './smiBlueGreenHelper'



import * as core from '@actions/core'
import { routeBlueGreenForDeploy } from './route'
import { DeployResult } from '../../types/deployResult'
import { K8sObject } from '../../types/k8sObject'

interface BlueGreenDeployment{
   deployResult: DeployResult,
   objects: K8sObject[]
}

export async function deployBlueGreen(
    kubectl: Kubectl,
    files: string[],
    routeStrategy: RouteStrategy
): Promise<BlueGreenDeployment>{

    const {deployResult, objects} = await Promise.resolve(
        (routeStrategy == RouteStrategy.INGRESS &&
           deployBlueGreenIngress(kubectl, files)) || 
           (routeStrategy == RouteStrategy.SMI &&
              deployBlueGreenSMI(kubectl, files)) ||
           deployBlueGreenService(kubectl, files)
     )
        
     core.startGroup('Routing blue green')
     await routeBlueGreenForDeploy(kubectl, files, routeStrategy)
     core.endGroup()

     return {deployResult, objects}
}

export async function deployBlueGreenSMI(
   kubectl: Kubectl,
   filePaths: string[]
): Promise<BlueGreenDeployment> {
   // get all kubernetes objects defined in manifest files
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // create services and other objects
   const newObjectsList = manifestObjects.otherObjects
      .concat(manifestObjects.serviceEntityList)
      .concat(manifestObjects.ingressEntityList)
      .concat(manifestObjects.unroutedServiceEntityList)
   
   deployObjects(kubectl, newObjectsList)

   // make extraservices and trafficsplit
   await setupSMI(kubectl, manifestObjects.serviceEntityList)

   // create new deloyments
   const workloadDeployment = await deployWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      GREEN_LABEL_VALUE
   )

   return {deployResult: workloadDeployment, objects: newObjectsList}
}

// refactor - ensure correct objects are getting returned here - do we want to add deployments and services as well to objects? see tests
export async function deployBlueGreenIngress(
    kubectl: Kubectl,
    filePaths: string[]
 ): Promise<BlueGreenDeployment> {
    // get all kubernetes objects defined in manifest files
    const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)
 
    // create deployments with green label value
    const workloadDeployment: DeployResult = await deployWithLabel(
       kubectl,
       manifestObjects.deploymentEntityList.concat(manifestObjects.serviceEntityList),
       GREEN_LABEL_VALUE
    )

    const newObjectsList = manifestObjects.otherObjects
       .concat(manifestObjects.unroutedServiceEntityList)
    
    deployObjects(kubectl, newObjectsList)
 
    core.debug('new objects after processing services and other objects: \n' + JSON.stringify(newObjectsList))

    return {deployResult: workloadDeployment, objects: newObjectsList}
 }



 export async function deployBlueGreenService(
    kubectl: Kubectl,
    filePaths: string[]
 ): Promise<BlueGreenDeployment> {
    const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)
 
    // create deployments with green label value
    const workloadDeployment = await deployWithLabel(
       kubectl,
       manifestObjects.deploymentEntityList,
       GREEN_LABEL_VALUE
    )
 
    // create other non deployment and non service entities
    const newObjectsList = manifestObjects.otherObjects
       .concat(manifestObjects.ingressEntityList)
       .concat(manifestObjects.unroutedServiceEntityList)

    
    deployObjects(kubectl, newObjectsList) 
    // returning deployment details to check for rollout stability
    // refactor - make this a "deploymentResult" type?
    return {deployResult: workloadDeployment, objects: newObjectsList}
 }
 

