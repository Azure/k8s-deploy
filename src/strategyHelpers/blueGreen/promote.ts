import {Kubectl} from '../../types/kubectl'
import {
   BlueGreenDeployment,
   BLUE_GREEN_VERSION_LABEL,
   deployWithLabel,
   fetchResource,
   GREEN_LABEL_VALUE,
   NONE_LABEL_VALUE
} from './blueGreenHelper'

import {isIngressRouted} from './ingressBlueGreenHelper'
import {validateServicesState} from './serviceBlueGreenHelper'

export async function promoteBlueGreenIngress(
    kubectl: Kubectl,
    manifestObjects
 ): Promise<BlueGreenDeployment> {
    //checking if anything to promote
    let {areValid, invalidIngresses} = validateIngresses(
       kubectl,
       manifestObjects.ingressEntityList,
       manifestObjects.serviceNameMap
    )
    if (!areValid) {
       throw 'Ingresses are not in promote state' + invalidIngresses.toString()
    }
    
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
 
          let isValid = !!existingIngress && existingIngress?.metadata?.labels[BLUE_GREEN_VERSION_LABEL] === GREEN_LABEL_VALUE 
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
): Promise<BlueGreenDeployment> {
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