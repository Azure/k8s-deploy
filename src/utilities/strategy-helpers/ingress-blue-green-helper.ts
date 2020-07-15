'use strict';

import * as core from '@actions/core';
import { Kubectl } from '../../kubectl-object-model';
import * as fileHelper from '../files-helper';
import { createWorkloadsWithLabel, getManifestObjects, getNewBlueGreenObject, addBlueGreenLabelsAndAnnotations, deleteWorkloadsAndServicesWithLabel, fetchResource, BlueGreenManifests, isGreenObject, getAuxiliaryService } from './blue-green-helper';
import { GREEN_LABEL_VALUE, NONE_LABEL_VALUE } from './blue-green-helper';
const BACKEND = 'BACKEND';

export function deployBlueGreenIngress(kubectl: Kubectl, filePaths: string[]) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects: BlueGreenManifests = getManifestObjects(kubectl, filePaths);

    // create deployments with green label value
    const result = createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, GREEN_LABEL_VALUE);

    // create new services and other objects 
    let newObjectsList = [];
    manifestObjects.serviceEntityList.forEach(inputObject => {
        const newBlueGreenObject = getAuxiliaryService(inputObject, GREEN_LABEL_VALUE);;
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    newObjectsList = newObjectsList.concat(manifestObjects.otherObjects).concat(manifestObjects.unroutedServiceEntityList).concat(manifestObjects.unroutedIngressEntityList);

    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    
    // return results to check for manifest stability
    return { manifestObjects: manifestObjects ,result: result};
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
    const manifestObjects: BlueGreenManifests = getManifestObjects(kubectl, filePaths);
    
    // routing ingress to stables services
    routeBlueGreenIngress(kubectl, NONE_LABEL_VALUE, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);
    
    // deleting green services and deployments
    deleteWorkloadsAndServicesWithLabel(kubectl, GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
}

export function routeBlueGreenIngress(kubectl: Kubectl, nextLabel: string, serviceNameMap: Map<string, string>, ingressEntityList: any[]) { 
    // depending on when route is called, a reverse map might be needed
    let serviceNameMapOpposite = new Map<string, string>();
    serviceNameMap.forEach((value, key) => {
        serviceNameMapOpposite.set(value, key);
    });

    let newObjectsList = [];
    ingressEntityList.forEach((ingressObject) => {
        if (isGreenObject(ingressObject)) {
            // if it is a green object, it would have '-green' services, so use revers map
            let newBlueGreenIngressObject = getUpdatedBlueGreenIngress(ingressObject, serviceNameMapOpposite, nextLabel);
            newObjectsList.push(newBlueGreenIngressObject);
        } else {
            // use regular map if ingress given in manifests
            let newBlueGreenIngressObject = getUpdatedBlueGreenIngress(ingressObject, serviceNameMap, nextLabel);
            newObjectsList.push(newBlueGreenIngressObject);
        }
    });

    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
}

export function validateIngressesState(kubectl: Kubectl, ingressEntityList: any[], serviceNameMap: Map<string, string>): boolean {
    let areIngressesTargetingNewServices: boolean = true;
    ingressEntityList.forEach((inputObject) => {
        //querying existing ingress
        let existingIngress = fetchResource(kubectl, inputObject.kind, inputObject.metadata.name);
        if(!!existingIngress) {
            if (!isGreenObject(existingIngress)) {
                areIngressesTargetingNewServices = false;
            }
        } else {
            // no ingress at all, so nothing to promote
            areIngressesTargetingNewServices = false;
        }
    });

    return areIngressesTargetingNewServices;
}

export function getUpdatedBlueGreenIngress(inputObject: any, serviceNameMap: Map<string, string>, type: string): object {
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
