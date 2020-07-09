'use strict';

import * as core from '@actions/core';
import { Kubectl } from '../../kubectl-object-model';
import * as fileHelper from '../files-helper';
import * as TaskInputParameters from '../../input-parameters';
import { createWorkloadssWithLabel, getManifestObjects, getNewBlueGreenObject, addBlueGreenLabelsAndAnnotations, deleteWorkloadsAndServicesWithLabel, fetchResource } from './blue-green-helper';
import { BLUE_GREEN_NEW_LABEL_VALUE, NONE_LABEL_VALUE, BLUE_GREEN_VERSION_LABEL } from './blue-green-helper';

const INGRESS_ROUTE = 'INGRESS';

export function isIngressRoute(): boolean {
    const routeMethod = TaskInputParameters.routeMethod;
    return routeMethod && routeMethod.toUpperCase() === INGRESS_ROUTE;
}
export function deployBlueGreenIngress(kubectl: Kubectl, filePaths: string[]) {

    // get all kubernetes objects defined in manifest files
    const manifestObjects = getManifestObjects(filePaths);

    // create deployments with green label value
    const result = createWorkloadssWithLabel(kubectl, manifestObjects.deploymentEntityList, BLUE_GREEN_NEW_LABEL_VALUE);

    // create new services and other objects 
    let newObjectsList = [];
    manifestObjects.serviceEntityList.forEach(inputObject => {
        const newBlueGreenObject = getNewBlueGreenObject(inputObject, 0, BLUE_GREEN_NEW_LABEL_VALUE);;
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    newObjectsList = newObjectsList.concat(manifestObjects.otherObjects);

    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    
    // return results to check for manifest stability
    return result;
}

export async function blueGreenPromoteIngress(kubectl: Kubectl, manifestObjects) {

    //checking if anything to promote
    if (!validateIngressState(kubectl, manifestObjects.ingressEntityList, manifestObjects.serviceNameMap)) {
        throw('NotInPromoteStateIngress');
    }

    // deleting existing stable deploymetns and services
    deleteWorkloadsAndServicesWithLabel(kubectl, null, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);

    // create stable deployments with new configuration
    const result = createWorkloadssWithLabel(kubectl, manifestObjects.deploymentEntityList, NONE_LABEL_VALUE);

    // create stable services
    const newObjectsList = [];
    manifestObjects.serviceEntityList.forEach((inputObject) => {
        const newBlueGreenObject = getNewBlueGreenObject(inputObject, 0, NONE_LABEL_VALUE);
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    
    // returning deployments to check for rollout stability
    return result;
}

export async function blueGreenRejectIngress(kubectl: Kubectl, filePaths: string[]) {

    // get all kubernetes objects defined in manifest files
    const manifestObjects = getManifestObjects(filePaths);
    
    // routing ingress to stables services
    blueGreenRouteIngress(kubectl, null, manifestObjects.serviceNameMap, manifestObjects.serviceEntityList, manifestObjects.ingressEntityList);
    
    // deleting green services and deployments
    deleteWorkloadsAndServicesWithLabel(kubectl, BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
}

export function blueGreenRouteIngress(kubectl: Kubectl, nextLabel: string, serviceNameMap: Map<string, string>, serviceEntityList: any[],  ingressEntityList: any[]) {
    
    let newObjectsList = [];
    if (!nextLabel) {
        newObjectsList = newObjectsList.concat(ingressEntityList);
    } else {
        ingressEntityList.forEach((inputObject) => {
            let isRouted: boolean = false;

            // sees if ingress targets a service in the given manifests
            JSON.parse(JSON.stringify(inputObject), (key, value) => {
                if (key === 'serviceName' && serviceNameMap.has(value)) {
                    isRouted = true;
                }
                return value;
            });

            // routing to green objects only if ingress is routed
            if (isRouted) {
                const newBlueGreenIngressObject = getUpdatedBlueGreenIngress(inputObject, serviceNameMap, BLUE_GREEN_NEW_LABEL_VALUE);
                newObjectsList.push(newBlueGreenIngressObject);
            } else {
                newObjectsList.push(inputObject);
            }
        });
    }

    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
}

export function validateIngressState(kubectl: Kubectl, ingressEntityList: any[], serviceNameMap: Map<string, string>): boolean {

    let isIngressTargetingNewServices: boolean = true;
    ingressEntityList.forEach((inputObject) => {
        let isRouted: boolean = false;
        // finding if ingress is targeting a service in given manifests
        JSON.parse(JSON.stringify(inputObject), (key, value) => {
            if (key === 'serviceName' && serviceNameMap.has(value)) {
                isRouted = true;
            }
            return value;
        });

        if (isRouted) {
            //querying existing ingress
            let existingIngress = fetchResource(kubectl, inputObject.kind, inputObject.metadata.name);
            if(!!existingIngress) {
                let currentLabel: string;
                // checking its label
                try {
                    currentLabel = existingIngress.metadata.labels[BLUE_GREEN_VERSION_LABEL];
                } catch {
                    // if no label exists, then not an ingress targeting green deployments
                    isIngressTargetingNewServices = false;
                }
                if (currentLabel != BLUE_GREEN_NEW_LABEL_VALUE) {
                    // if not green label, then wrong configuration
                    isIngressTargetingNewServices = false;
                }
            } else {
                // no ingress at all, so nothing to promote
                isIngressTargetingNewServices = false;
            }
        }
    });

    return isIngressTargetingNewServices;
}


export function getUpdatedBlueGreenIngress(inputObject: any, serviceNameMap: Map<string, string>, type: string): object {
    if(!type) {
        // returning original with no modifications
        return inputObject;
    }
    
    const newObject = JSON.parse(JSON.stringify(inputObject));
    //adding green labels and values
    addBlueGreenLabelsAndAnnotations(newObject, type);

    // Updating ingress labels
    let finalObject =  updateIngressBackend(newObject, serviceNameMap);
    return finalObject;
}

export function updateIngressBackend(inputObject: any, serviceNameMap: Map<string, string>): any {
    inputObject = JSON.parse(JSON.stringify(inputObject), (key, value) => {
        if(key.toUpperCase() === 'BACKEND') {
            let serName = value.serviceName; 
            if (serviceNameMap.has(serName)) {
                //updating srvice name with corresponging bluegreen name only if service is provied in given manifests
                value.serviceName = serviceNameMap.get(serName);
            }
        }
        return value;
    });

    return inputObject;
} 
