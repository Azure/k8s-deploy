import { DeployResult } from "./deployResult"
import { K8sObject, K8sDeleteObject } from "./k8sObject"

export interface BlueGreenDeployment {
    deployResult: DeployResult
    objects: K8sObject[]
 }
 
 export interface BlueGreenManifests {
    serviceEntityList: K8sObject[]
    serviceNameMap: Map<string, string>
    unroutedServiceEntityList: K8sObject[]
    deploymentEntityList: K8sObject[]
    ingressEntityList: K8sObject[]
    otherObjects: K8sObject[]
 }

 export interface BlueGreenRejectResult {
    deleteResult: K8sDeleteObject[]
    routeResult: BlueGreenDeployment
 }