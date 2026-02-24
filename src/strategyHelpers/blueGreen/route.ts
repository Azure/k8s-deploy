import {sleep} from '../../utilities/timeUtils.js'
import {RouteStrategy} from '../../types/routeStrategy.js'
import {Kubectl} from '../../types/kubectl.js'
import {
   BlueGreenDeployment,
   BlueGreenManifests
} from '../../types/blueGreenTypes.js'
import {
   getManifestObjects,
   GREEN_LABEL_VALUE,
   deployObjects
} from './blueGreenHelper.js'

import {
   getUpdatedBlueGreenIngress,
   isIngressRouted
} from './ingressBlueGreenHelper.js'
import {getUpdatedBlueGreenService} from './serviceBlueGreenHelper.js'
import {createTrafficSplitObject} from './smiBlueGreenHelper.js'

import * as core from '@actions/core'
import {K8sObject, TrafficSplitObject} from '../../types/k8sObject.js'
import {getBufferTime} from '../../inputUtils.js'

export async function routeBlueGreenForDeploy(
   kubectl: Kubectl,
   inputManifestFiles: string[],
   routeStrategy: RouteStrategy,
   timeout?: string
): Promise<BlueGreenDeployment> {
   // sleep for buffer time
   const bufferTime: number = getBufferTime()
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

   // route to new deployments
   if (routeStrategy == RouteStrategy.INGRESS) {
      return await routeBlueGreenIngress(
         kubectl,
         manifestObjects.serviceNameMap,
         manifestObjects.ingressEntityList,
         timeout
      )
   } else if (routeStrategy == RouteStrategy.SMI) {
      return await routeBlueGreenSMI(
         kubectl,
         GREEN_LABEL_VALUE,
         manifestObjects.serviceEntityList,
         timeout
      )
   } else {
      return await routeBlueGreenService(
         kubectl,
         GREEN_LABEL_VALUE,
         manifestObjects.serviceEntityList,
         timeout
      )
   }
}

export async function routeBlueGreenIngress(
   kubectl: Kubectl,
   serviceNameMap: Map<string, string>,
   ingressEntityList: any[],
   timeout?: string
): Promise<BlueGreenDeployment> {
   // const newObjectsList = []
   const newObjectsList: K8sObject[] = ingressEntityList.map((obj) => {
      if (isIngressRouted(obj, serviceNameMap)) {
         const newBlueGreenIngressObject = getUpdatedBlueGreenIngress(
            obj,
            serviceNameMap,
            GREEN_LABEL_VALUE
         )
         return newBlueGreenIngressObject
      } else {
         core.debug(`unrouted ingress detected ${obj.metadata.name}`)
         return obj
      }
   })

   const deployResult = await deployObjects(kubectl, newObjectsList, timeout)

   return {deployResult, objects: newObjectsList}
}

export async function routeBlueGreenIngressUnchanged(
   kubectl: Kubectl,
   serviceNameMap: Map<string, string>,
   ingressEntityList: any[],
   timeout?: string
): Promise<BlueGreenDeployment> {
   const objects = ingressEntityList.filter((ingress) =>
      isIngressRouted(ingress, serviceNameMap)
   )

   const deployResult = await deployObjects(kubectl, objects, timeout)
   return {deployResult, objects}
}

export async function routeBlueGreenService(
   kubectl: Kubectl,
   nextLabel: string,
   serviceEntityList: any[],
   timeout?: string
): Promise<BlueGreenDeployment> {
   const objects = serviceEntityList.map((serviceObject) =>
      getUpdatedBlueGreenService(serviceObject, nextLabel)
   )

   const deployResult = await deployObjects(kubectl, objects, timeout)

   return {deployResult, objects}
}

export async function routeBlueGreenSMI(
   kubectl: Kubectl,
   nextLabel: string,
   serviceEntityList: any[],
   timeout?: string
): Promise<BlueGreenDeployment> {
   // let tsObjects: TrafficSplitObject[] = []

   const tsObjects: TrafficSplitObject[] = await Promise.all(
      serviceEntityList.map(async (serviceObject) => {
         const tsObject: TrafficSplitObject = await createTrafficSplitObject(
            kubectl,
            serviceObject.metadata.name,
            nextLabel,
            timeout
         )

         return tsObject
      })
   )

   const deployResult = await deployObjects(kubectl, tsObjects, timeout)

   return {deployResult, objects: tsObjects}
}
