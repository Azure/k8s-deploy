'use strict';

import { Kubectl } from '../../kubectl-object-model';
import * as fileHelper from '../files-helper';
import { createWorkloadsWithLabel, getManifestObjects, addBlueGreenLabelsAndAnnotations, fetchResource, deleteWorkloadsWithLabel, cleanUp, isServiceRouted } from './blue-green-helper';
import { GREEN_LABEL_VALUE, NONE_LABEL_VALUE, BLUE_GREEN_VERSION_LABEL } from './blue-green-helper';

export function deployBlueGreenService(kubectl: Kubectl, filePaths: string[]) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = getManifestObjects(filePaths);

    // create deployments with green label value
    const result = createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, GREEN_LABEL_VALUE);

    // create other non deployment and non service entities
    const newObjectsList = manifestObjects.otherObjects.concat(manifestObjects.ingressEntityList);
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    
    // returning deployment details to check for rollout stability
    return result;
}

export async function promoteBlueGreenService(kubectl: Kubectl, manifestObjects) {
    // checking if services are in the right state ie. targeting green deployments
    if (!validateServicesState(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList)) {
        throw('NotInPromoteState');
    }

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
    deleteWorkloadsWithLabel(kubectl, GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
}

export function routeBlueGreenService(kubectl: Kubectl, nextLabel: string, deploymentEntityList: any[], serviceEntityList: any[]) {
    const newObjectsList = [];
    serviceEntityList.forEach((serviceObject) => {
        if (isServiceRouted(serviceObject, deploymentEntityList)) {
            // if service is routed, point it to given label
            const newBlueGreenServiceObject = getUpdatedBlueGreenService(serviceObject, nextLabel);
            newObjectsList.push(newBlueGreenServiceObject);
        } else {
            // if service is not routed, just push the original service
            newObjectsList.push(serviceObject);
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

export function validateServicesState(kubectl: Kubectl, deploymentEntityList: any[], serviceEntityList: any[]): boolean {
    let areServicesGreen: boolean = true;
    serviceEntityList.forEach((serviceObject) => {
        if (isServiceRouted(serviceObject, deploymentEntityList)) {
            // finding the existing routed service
            const existingService = fetchResource(kubectl, serviceObject.kind, serviceObject.metadata.name);
            if (!!existingService) {
                let currentLabel: string = getServiceSpecLabel(existingService);
                if(currentLabel != GREEN_LABEL_VALUE) {
                    // service should be targeting deployments with green label
                    areServicesGreen = false;
                }
            } else {
                // service targeting deployment doesn't exist
                areServicesGreen = false;
            }
        }
    });
    return areServicesGreen;
}

export function getServiceSpecLabel(inputObject: any): string {
    if(!!inputObject && inputObject.spec && inputObject.spec.selector && inputObject.spec.selector[BLUE_GREEN_VERSION_LABEL]) {
        return inputObject.spec.selector[BLUE_GREEN_VERSION_LABEL]; 
    }
    return '';
}
