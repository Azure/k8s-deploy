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
import {DeployResult} from '../../types/deployResult'

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
   const routeDeployment = await routeBlueGreenForDeploy(
      kubectl,
      files,
      routeStrategy
   )
   core.endGroup()

   blueGreenDeployment.objects.push(...routeDeployment.objects)
   blueGreenDeployment.deployResult.manifestFiles.push(
      ...routeDeployment.deployResult.manifestFiles
   )
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

   const otherObjDeployment: DeployResult = await deployObjects(
      kubectl,
      newObjectsList
   )

   // make extraservices and trafficsplit
   const smiAndSvcDeployment = await setupSMI(
      kubectl,
      manifestObjects.serviceEntityList
   )

   // create new deloyments
   const blueGreenDeployment: BlueGreenDeployment = await deployWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      GREEN_LABEL_VALUE
   )

   blueGreenDeployment.objects.push(...newObjectsList)
   blueGreenDeployment.objects.push(...smiAndSvcDeployment.objects)

   blueGreenDeployment.deployResult.manifestFiles.push(
      ...otherObjDeployment.manifestFiles
   )
   blueGreenDeployment.deployResult.manifestFiles.push(
      ...smiAndSvcDeployment.deployResult.manifestFiles
   )

   return blueGreenDeployment
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

   await deployObjects(kubectl, newObjectsList)
   // returning deployment details to check for rollout stability
   return {
      deployResult: blueGreenDeployment.deployResult,
      objects: [].concat(blueGreenDeployment.objects, newObjectsList)
   }
}
