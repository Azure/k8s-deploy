'use strict';

import * as core from '@actions/core';
import { Kubectl } from '../../kubectl-object-model';
import * as fileHelper from '../files-helper';
import { createWorkloadsWithLabel, getManifestObjects, getNewBlueGreenObject, addBlueGreenLabelsAndAnnotations, deleteWorkloadsAndServicesWithLabel, fetchResource, BlueGreenManifests } from './blue-green-helper';
import { GREEN_LABEL_VALUE, NONE_LABEL_VALUE, BLUE_GREEN_VERSION_LABEL } from './blue-green-helper';
const BACKEND = 'BACKEND';

export function deployBlueGreenIngress(kubectl: Kubectl, filePaths: string[]) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths);

    // create deployments with green label value
    const result = createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, GREEN_LABEL_VALUE);

    // create new services and other objects 
    let newObjectsList = [];
    manifestObjects.serviceEntityList.forEach(inputObject => {
        const newBlueGreenObject = getNewBlueGreenObject(inputObject, GREEN_LABEL_VALUE);;
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    newObjectsList = newObjectsList.concat(manifestObjects.otherObjects).concat(manifestObjects.unroutedServiceEntityList);

    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    
    // return results to check for manifest stability
    return result;
}

export async function promoteBlueGreenIngress(kubectl: Kubectl, manifestObjects) {
    //checking if anything to promote
    if (!validateIngressesState(kubectl, manifestObjects.ingressEntityList, manifestObjects.serviceNameMap)) {
        throw('NotInPromoteStateIngress');
    }

    // create stable deployments with new configuration
    const result = createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, NONE_LABEL_VALUE);

    // create stable services with new configuration
    const newObjectsList = [];
    manifestObjects.serviceEntityList.forEach((inputObject) => {
        const newBlueGreenObject = getNewBlueGreenObject(inputObject, NONE_LABEL_VALUE);
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    
    // returning deployments to check for rollout stability
    return result;
}

export async function rejectBlueGreenIngress(kubectl: Kubectl, filePaths: string[]) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects: BlueGreenManifests = getManifestObjects(filePaths);
    
    // routing ingress to stables services
    routeBlueGreenIngress(kubectl, null, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);
    
    // deleting green services and deployments
    deleteWorkloadsAndServicesWithLabel(kubectl, GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
}

export function routeBlueGreenIngress(kubectl: Kubectl, nextLabel: string, serviceNameMap: Map<string, string>, ingressEntityList: any[]) { 
    let newObjectsList = [];
    if (!nextLabel) {
        newObjectsList = ingressEntityList.filter(ingress => isIngressRouted(ingress, serviceNameMap));
    } else {
        ingressEntityList.forEach((inputObject) => {
            if (isIngressRouted(inputObject, serviceNameMap)) {
                const newBlueGreenIngressObject = getUpdatedBlueGreenIngress(inputObject, serviceNameMap, GREEN_LABEL_VALUE);
                newObjectsList.push(newBlueGreenIngressObject);
            } else {
                newObjectsList.push(inputObject);
            }
        });
    }

    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
}

export function validateIngressesState(kubectl: Kubectl, ingressEntityList: any[], serviceNameMap: Map<string, string>): boolean {
    let areIngressesTargetingNewServices: boolean = true;
    ingressEntityList.forEach((inputObject) => {
        if (isIngressRouted(inputObject, serviceNameMap)) {
            //querying existing ingress
            let existingIngress = fetchResource(kubectl, inputObject.kind, inputObject.metadata.name);
            if(!!existingIngress) {
                let currentLabel: string;
                // checking its label
                try {
                    currentLabel = existingIngress.metadata.labels[BLUE_GREEN_VERSION_LABEL];
                } catch {
                    // if no label exists, then not an ingress targeting green deployments
                    areIngressesTargetingNewServices = false;
                }
                if (currentLabel != GREEN_LABEL_VALUE) {
                    // if not green label, then wrong configuration
                    areIngressesTargetingNewServices = false;
                }
            } else {
                // no ingress at all, so nothing to promote
                areIngressesTargetingNewServices = false;
            }
        }
    });

    return areIngressesTargetingNewServices;
}


function isIngressRouted(ingressObject: any, serviceNameMap: Map<string, string>): boolean {
    let isIngressRouted: boolean = false;
    // sees if ingress targets a service in the given manifests
    JSON.parse(JSON.stringify(ingressObject), (key, value) => {
        if (key === 'serviceName' && serviceNameMap.has(value)) {
            isIngressRouted = true;
        }
        return value;
    });
    return isIngressRouted;
}


export function getUpdatedBlueGreenIngress(inputObject: any, serviceNameMap: Map<string, string>, type: string): object {
    if(!type) {
        // returning original with no modifications
        return inputObject;
    }
    
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // adding green labels and values
    addBlueGreenLabelsAndAnnotations(newObject, type);

    // Updating ingress labels
    let finalObject = updateIngressBackend(newObject, serviceNameMap);
    return finalObject;
}

export function updateIngressBackend(inputObject: any, serviceNameMap: Map<string, string>): any {
    inputObject = JSON.parse(JSON.stringify(inputObject), (key, value) => {
        if(key.toUpperCase() === BACKEND) {
            let serviceName = value.serviceName; 
            if (serviceNameMap.has(serviceName)) {
                // updating service name with corresponding bluegreen name only if service is provied in given manifests
                value.serviceName = serviceNameMap.get(serviceName);
            }
        }
        return value;
    });

    return inputObject;
} 
