import * as core from '@actions/core'

import {DeployResult} from '../../types/deployResult'
import {Kubectl} from '../../types/kubectl'
import {RouteStrategy} from '../../types/routeStrategy'

import {
   BlueGreenDeployment,
   BlueGreenManifests,
   deployWithLabel,
   getManifestObjects,
   GREEN_LABEL_VALUE,
   deployObjects
} from './blueGreenHelper'
import {setupSMI} from './smiBlueGreenHelper'

import {routeBlueGreenForDeploy} from './route'

export async function deployBlueGreen(
   kubectl: Kubectl,
   files: string[],
   routeStrategy: RouteStrategy
): Promise<BlueGreenDeployment> {
   let blueGreenDeployment: BlueGreenDeployment

   if(routeStrategy == RouteStrategy.INGRESS){
      blueGreenDeployment = await Promise.resolve(deployBlueGreenIngress(kubectl, files))
   } else if(routeStrategy == RouteStrategy.SMI){
      blueGreenDeployment = await Promise.resolve(deployBlueGreenSMI(kubectl, files))
   } else{
      blueGreenDeployment = await Promise.resolve(deployBlueGreenService(kubectl, files))
   }

   core.startGroup('Routing blue green')
   await routeBlueGreenForDeploy(kubectl, files, routeStrategy)
   core.endGroup()
   core.debug("objects deployed for " + routeStrategy + ": "  + JSON.stringify(blueGreenDeployment.objects))
   return blueGreenDeployment
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

   await deployObjects(kubectl, newObjectsList)

   // make extraservices and trafficsplit
   await setupSMI(kubectl, manifestObjects.serviceEntityList)

   // create new deloyments
   const blueGreenDeployment: BlueGreenDeployment = await deployWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      GREEN_LABEL_VALUE
   )
   return {deployResult: blueGreenDeployment.deployResult, objects: blueGreenDeployment.objects.concat(newObjectsList)}
}

export async function deployBlueGreenIngress(
   kubectl: Kubectl,
   filePaths: string[]
): Promise<BlueGreenDeployment> {
   // get all kubernetes objects defined in manifest files
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // create deployments with green label value
   let servicesAndDeployments = manifestObjects.deploymentEntityList.concat(
      manifestObjects.serviceEntityList
   )
   const workloadDeployment: BlueGreenDeployment = await deployWithLabel(
      kubectl,
      servicesAndDeployments,
      GREEN_LABEL_VALUE
   )

   const otherObjects = manifestObjects.otherObjects.concat(
      manifestObjects.unroutedServiceEntityList
   )

   deployObjects(kubectl, otherObjects)

   core.debug(
      'new objects after processing services and other objects: \n' +
         JSON.stringify(servicesAndDeployments)
   )

   return {deployResult: workloadDeployment.deployResult, objects: workloadDeployment.objects.concat(otherObjects)}
}

export async function deployBlueGreenService(
   kubectl: Kubectl,
   filePaths: string[]
): Promise<BlueGreenDeployment> {
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // create deployments with green label value
   const blueGreenDeployment: BlueGreenDeployment = await deployWithLabel(
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
   return {deployResult: blueGreenDeployment.deployResult, objects: blueGreenDeployment.objects.concat(newObjectsList)}
}
