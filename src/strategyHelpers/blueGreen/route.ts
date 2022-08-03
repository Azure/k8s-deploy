import {Kubectl} from '../../types/kubectl'
import {sleep} from '../../utilities/timeUtils'
import {RouteStrategy} from '../../types/routeStrategy'
import {
   BlueGreenDeployment,
   BlueGreenManifests,
   getManifestObjects,
   GREEN_LABEL_VALUE,
   deployObjects
} from './blueGreenHelper'

import {
   getUpdatedBlueGreenIngress,
   isIngressRouted
} from './ingressBlueGreenHelper'
import {getUpdatedBlueGreenService} from './serviceBlueGreenHelper'
import {routeBlueGreenSMI} from './smiBlueGreenHelper'

import * as core from '@actions/core'

export async function routeBlueGreenForDeploy(
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

export async function routeBlueGreenIngress(
   kubectl: Kubectl,
   serviceNameMap: Map<string, string>,
   ingressEntityList: any[]
): Promise<BlueGreenDeployment> {
   let newObjectsList = []

   ingressEntityList.forEach((inputObject) => {
      if (isIngressRouted(inputObject, serviceNameMap)) {
         const newBlueGreenIngressObject = getUpdatedBlueGreenIngress(
            inputObject,
            serviceNameMap,
            GREEN_LABEL_VALUE
         )
         newObjectsList.push(newBlueGreenIngressObject)
      } else {
         newObjectsList.push(inputObject)
      }
   })

   let deployResult = await deployObjects(kubectl, newObjectsList)

   return {deployResult, objects: newObjectsList}
}

export async function routeBlueGreenIngressUnchanged(
   kubectl: Kubectl,
   serviceNameMap: Map<string, string>,
   ingressEntityList: any[]
): Promise<BlueGreenDeployment> {
   const objects = ingressEntityList.filter((ingress) =>
      isIngressRouted(ingress, serviceNameMap)
   )

   let deployResult = await deployObjects(kubectl, objects)
   return {deployResult, objects}
}

export async function routeBlueGreenService(
   kubectl: Kubectl,
   nextLabel: string,
   serviceEntityList: any[]
): Promise<BlueGreenDeployment> {
   const objects = []
   serviceEntityList.forEach((serviceObject) => {
      const newBlueGreenServiceObject = getUpdatedBlueGreenService(
         serviceObject,
         nextLabel
      )
      objects.push(newBlueGreenServiceObject)
   })

   let deployResult = await deployObjects(kubectl, objects)

   return {deployResult, objects}
}
