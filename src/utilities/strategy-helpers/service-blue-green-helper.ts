'use strict';

import { Kubectl } from '../../kubectl-object-model';
import * as fileHelper from '../files-helper';
import { createWorkloadsWithLabel, getManifestObjects, addBlueGreenLabelsAndAnnotations, getServiceSelector, getDeploymentMatchLabels, fetchResource, deleteWorkloadsWithLabel, cleanUp, isServiceSelectorSubsetOfMatchLabel } from './blue-green-helper';
import { BLUE_GREEN_NEW_LABEL_VALUE, NONE_LABEL_VALUE, BLUE_GREEN_VERSION_LABEL } from './blue-green-helper';

export function deployBlueGreenService(kubectl: Kubectl, filePaths: string[]) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = getManifestObjects(filePaths);

    // create deployments with green label value
    const result = createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, BLUE_GREEN_NEW_LABEL_VALUE);

    // create other non deployment and non service entities
    const newObjectsList = manifestObjects.otherObjects.concat(manifestObjects.ingressEntityList);
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    
    // returning deployment details to check for rollout stability
    return result;
}

export async function blueGreenPromote(kubectl: Kubectl, manifestObjects) {
    // checking if services are in the right state ie. targeting green deployments
    if (!validateServiceState(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList)) {
        throw('NotInPromoteState');
    }

    // deleting previous stable deployments
    deleteWorkloadsWithLabel(kubectl, NONE_LABEL_VALUE, manifestObjects.deploymentEntityList);

    // creating stable deployments with new configurations
    const result = createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, NONE_LABEL_VALUE);
    
    // returning deployment details to check for rollout stability
    return result;
}

export async function blueGreenReject(kubectl: Kubectl, filePaths: string[]) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = getManifestObjects(filePaths);

    // routing to stable objects
    routeBlueGreenService(kubectl, NONE_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);

    // seeing if we should even delete the service
    cleanUp(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
    
    // deleting the new deployments with green suffix
    deleteWorkloadsWithLabel(kubectl, BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.deploymentEntityList);
}

export function routeBlueGreenService(kubectl: Kubectl, nextLabel: string, deploymentEntityList: any[], serviceEntityList: any[]) {
    const newObjectsList = [];
    serviceEntityList.forEach((inputObject) => {
        let isRouted: boolean = false;
        deploymentEntityList.forEach((depObject) => {
            // finding if there is a deployment in the given manifests the service targets
            const serviceSelector: string = getServiceSelector(inputObject);
            const matchLabels: string = getDeploymentMatchLabels(depObject); 
            if (!!serviceSelector && !!matchLabels && isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels)) {
                isRouted = true;
                // decided that this service needs to be routed
                // point to the given nextlabel
                const newBlueGreenServiceObject = getUpdatedBlueGreenService(inputObject, nextLabel);
                newObjectsList.push(newBlueGreenServiceObject);
            }
        });
        if (!isRouted) {
            // if service is not routed, just push the original service
            newObjectsList.push(inputObject);
        }
    });
    // configures the services
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
}

// adding green labels to configure existing service
function getUpdatedBlueGreenService(inputObject: any, labelValue: string): object {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // Adding labels and annotations.
    addBlueGreenLabelsAndAnnotations(newObject, labelValue);
    return newObject;
}


export function validateServiceState(kubectl: Kubectl, deploymentEntityList: any[], serviceEntityList: any[]): boolean {
    let isServiceTargetingNewWorkloads: boolean = true;
    serviceEntityList.forEach((inputObject) => {
        deploymentEntityList.forEach((depObject) => {
            // finding out if the service is pointing to a deployment in this manifest
            const serviceSelector: string = getServiceSelector(inputObject);
            const matchLabels: string = getDeploymentMatchLabels(depObject); 
            if (!!serviceSelector && !!matchLabels && isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels)) {
                // finding the existing routed service
                let existingService = fetchResource(kubectl, inputObject.kind, inputObject.metadata.name);
                if (!!existingService) {
                    let currentLabel: string = getServiceSpecLabel(existingService);
                    if(currentLabel != BLUE_GREEN_NEW_LABEL_VALUE) {
                        // service should be targeting deployments with green label
                        isServiceTargetingNewWorkloads = false;
                    }
                } else {
                    // service targeting deployment doesn't exist
                    isServiceTargetingNewWorkloads = false;
                }
            }
        });
    });

    return isServiceTargetingNewWorkloads;
}

export function getServiceSpecLabel(inputObject: any): string {
    if(!!inputObject && inputObject.spec && inputObject.spec.selector && inputObject.spec.selector[BLUE_GREEN_VERSION_LABEL]) {
        return inputObject.spec.selector[BLUE_GREEN_VERSION_LABEL]; 
    }
    return '';
}
