import * as core from '@actions/core'

import {Kubectl} from '../../types/kubectl'
import {
   BlueGreenDeployment,
   BlueGreenManifests
} from '../../types/blueGreenTypes'

import {RouteStrategy} from '../../types/routeStrategy'

import {
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
   const blueGreenDeployment = await (async () => {
      switch (routeStrategy) {
         case RouteStrategy.INGRESS:
            return await deployBlueGreenIngress(kubectl, files)
         case RouteStrategy.SMI:
            return await deployBlueGreenSMI(kubectl, files)
         default:
            return await deployBlueGreenService(kubectl, files)
      }
   })()

   core.startGroup('Routing blue green')
   await routeBlueGreenForDeploy(kubectl, files, routeStrategy)
   core.endGroup()

   return blueGreenDeployment
}

export async function deployBlueGreenSMI(
   kubectl: Kubectl,
   filePaths: string[]
): Promise<BlueGreenDeployment> {
   // get all kubernetes objects defined in manifest files
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // create services and other objects
   const newObjectsList = [].concat(
      manifestObjects.otherObjects,
      manifestObjects.serviceEntityList,
      manifestObjects.ingressEntityList,
      manifestObjects.unroutedServiceEntityList
   )

   await deployObjects(kubectl, newObjectsList)

   // make extraservices and trafficsplit
   await setupSMI(kubectl, manifestObjects.serviceEntityList)

   // create new deloyments
   const blueGreenDeployment: BlueGreenDeployment = await deployWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      GREEN_LABEL_VALUE
   )
   return {
      deployResult: blueGreenDeployment.deployResult,
      objects: [].concat(blueGreenDeployment.objects, newObjectsList)
   }
}

export async function deployBlueGreenIngress(
   kubectl: Kubectl,
   filePaths: string[]
): Promise<BlueGreenDeployment> {
   // get all kubernetes objects defined in manifest files
   const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths)

   // create deployments with green label value
   const servicesAndDeployments = [].concat(
      manifestObjects.deploymentEntityList,
      manifestObjects.serviceEntityList
   )
   const workloadDeployment: BlueGreenDeployment = await deployWithLabel(
      kubectl,
      servicesAndDeployments,
      GREEN_LABEL_VALUE
   )

   const otherObjects = [].concat(
      manifestObjects.otherObjects,
      manifestObjects.unroutedServiceEntityList
   )

   await deployObjects(kubectl, otherObjects)

   core.debug(
      `new objects after processing services and other objects: \n
         ${JSON.stringify(servicesAndDeployments)}`
   )

   return {
      deployResult: workloadDeployment.deployResult,
      objects: [].concat(workloadDeployment.objects, otherObjects)
   }
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
   const newObjectsList = [].concat(
      manifestObjects.otherObjects,
      manifestObjects.ingressEntityList,
      manifestObjects.unroutedServiceEntityList
   )

   deployObjects(kubectl, newObjectsList)
   // returning deployment details to check for rollout stability
   return {
      deployResult: blueGreenDeployment.deployResult,
      objects: [].concat(blueGreenDeployment.objects, newObjectsList)
   }
}
