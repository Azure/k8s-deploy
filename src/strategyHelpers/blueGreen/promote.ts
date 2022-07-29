import {Kubectl} from '../../types/kubectl'
import * as fileHelper from '../../utilities/fileUtils'
import {
   addBlueGreenLabelsAndAnnotations,
   BLUE_GREEN_VERSION_LABEL,
   BlueGreenManifests,
   deployWithLabel,
   fetchResource,
   getManifestObjects,
   getNewBlueGreenObject,
   GREEN_LABEL_VALUE,
   NONE_LABEL_VALUE
} from './blueGreenHelper'

import {isIngressRouted} from './ingressBlueGreenHelper'
import {validateServicesState} from './serviceBlueGreenHelper'

import * as core from '@actions/core'

// refactor - gonna need to add tests to ensure correct set of objects are being passed in through here
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
    
    // refactor - NEED TO FIX THIS!!! ALSO NEED TO MAKE SURE THAT TAKING OUT NONE_LABEL DIDN'T ACTUALLY BREAK ANYTHING - 
    // UNDER CURRENT RELEASE, PROMOTE STRATEGY GIVES OBJECTS A "NONE" COLOR... IS THAT STILL GONNA HAPPEN? I THINK WE
    // NEED TO KEEP THAT!!
    // create stable deployments with new configuration
    const result = deployWithLabel(
       kubectl,
       manifestObjects.deploymentEntityList.concat(manifestObjects.serviceEntityList),
       NONE_LABEL_VALUE
    )
 
    // create stable services with new configuration
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

 export async function promoteBlueGreenService(
   kubectl: Kubectl,
   manifestObjects
) {
   // checking if services are in the right state ie. targeting green deployments
   if (
      !(await validateServicesState(kubectl, manifestObjects.serviceEntityList))
   ) {
      throw 'Not inP promote state'
   }

   // creating stable deployments with new configurations
   return await deployWithLabel(
      kubectl,
      manifestObjects.deploymentEntityList,
      NONE_LABEL_VALUE
   )
}