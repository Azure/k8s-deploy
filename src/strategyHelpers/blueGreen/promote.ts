import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
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
   NONE_LABEL_VALUE
} from './blueGreenHelper'

import {isIngressRouted} from './ingressBlueGreenHelper'

import * as core from '@actions/core'

export async function promoteBlueGreenIngress(
    kubectl: Kubectl,
    manifestObjects
 ) {
    //checking if anything to promote
    var {areValid, invalidIngresses} = validateIngresses(
       kubectl,
       manifestObjects.ingressEntityList,
       manifestObjects.serviceNameMap
    )
    if (!areValid) {
       throw 'Ingresses are not in promote state' + invalidIngresses.toString()
    }
 
    // create stable deployments with new configuration
    const result = createWorkloadsWithLabel(
       kubectl,
       manifestObjects.deploymentEntityList,
       NONE_LABEL_VALUE
    )
 
    // refactor - separate function call to maintain some logical pattern - have deployments happen in some extenral call rather than right here, just like
    // is done for deployments
    // create stable services with new configuration
    const newObjectsList = []
    manifestObjects.serviceEntityList.forEach((inputObject) => {
       const newBlueGreenObject = getNewBlueGreenObject(
          inputObject,
          NONE_LABEL_VALUE
       )
       newObjectsList.push(newBlueGreenObject)
    })
 
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
    await kubectl.apply(manifestFiles)
 
    return result
 }

 export function validateIngresses(
    kubectl: Kubectl,
    ingressEntityList: any[],
    serviceNameMap: Map<string, string>
 ): {areValid: boolean, invalidIngresses: string[]} {
    let areValid: boolean = true
    const invalidIngresses = []
    ingressEntityList.forEach(async (inputObject) => {
       if (isIngressRouted(inputObject, serviceNameMap)) {
          //querying existing ingress
          const existingIngress = await fetchResource(
             kubectl,
             inputObject.kind,
             inputObject.metadata.name
          )
 
          var isValid = !!existingIngress && existingIngress?.metadata?.labels[BLUE_GREEN_VERSION_LABEL] === GREEN_LABEL_VALUE 
          if (!isValid){
             invalidIngresses.push(inputObject.metadata.name)
          }
          // to be valid, ingress should exist and should be green
          areValid = areValid && isValid
 
       }
    })
 
    return {areValid, invalidIngresses}
 }