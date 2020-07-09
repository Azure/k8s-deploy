'use strict';

import * as core from '@actions/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { checkForErrors } from '../utility';
import { Kubectl } from '../../kubectl-object-model';
import { KubernetesWorkload } from '../../constants';
import { StringComparer, isEqual } from '../string-comparison';
import * as fileHelper from '../files-helper';
import * as helper from '../resource-object-utility';

export const BLUE_GREEN_NEW_LABEL_VALUE = 'green';
export const NONE_LABEL_VALUE = 'None';
export const BLUE_GREEN_VERSION_LABEL = 'k8s.deploy.color';
export const BLUE_GREEN_SUFFIX = '-green';
export const STABLE_SUFFIX = '-stable'

export function deleteWorkloadsWithLabel(kubectl: Kubectl, deleteLabel: string, deploymentEntityList: any[]) {
    
    let delList = []
    deploymentEntityList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        const kind = inputObject.kind;
        if (deleteLabel === NONE_LABEL_VALUE) {
            // if dellabel is none, deletes stable deployments
            const tempObject = { name : name, kind : kind};
            delList.push(tempObject);
        } else {
            // if dellabel is not none, then deletes new green deployments
            const tempObject = { name : name+BLUE_GREEN_SUFFIX, kind : kind };
            delList.push(tempObject);
        }
    });

    // deletes the deployments
    delList.forEach((delObject) => {
        try {
            const result = kubectl.delete([delObject.kind, delObject.name]);
            checkForErrors([result]);
        } catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    });
}

export function cleanUp(kubectl: Kubectl, deploymentEntityList: any[], serviceEntityList: any[]) {
    // checks if services has some stable deployments to target or deletes them too
    let delList = []; 
    serviceEntityList.forEach((inputObject) => {
        deploymentEntityList.forEach((depObject) => {
            const kind = depObject.kind;
            const name = depObject.metadata.name;
            if (getServiceSelector(inputObject) && getDeploymentMatchLabels(depObject) && getServiceSelector(inputObject) === getDeploymentMatchLabels(depObject)) {
                const existingDeploy = fetchResource(kubectl, kind, name);
                // checking if it has something to target
                if (!existingDeploy) {
                    const tempObject = { name : inputObject.metadata.name, kind : inputObject.kind };
                    delList.push(tempObject);
                } 
            }
        });
    });

    delList.forEach((delObject) => {
        try {
            const result = kubectl.delete([delObject.kind, delObject.name]);
            checkForErrors([result]);
        } catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    });
}

export function deleteWorkloadsAndServicesWithLabel(kubectl: Kubectl, deleteLabel: string, deploymentEntityList: any[], serviceEntityList: any[]) {

    // need to delete services and deployments
    const deletionEntitiesList = deploymentEntityList.concat(serviceEntityList);
    let deleteList = []
    deletionEntitiesList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        const kind = inputObject.kind;
        if (!deleteLabel) {
            // if not dellabel, delete stable objects
            const tempObject = { name : name, kind : kind};
            deleteList.push(tempObject);
        } else {
            // else delete green labels
            const tempObject = { name : name+BLUE_GREEN_SUFFIX, kind : kind };
            deleteList.push(tempObject);
        }
    });

    // delete services and deployments
    deleteList.forEach((delObject) => {
        try {
            const result = kubectl.delete([delObject.kind, delObject.name]);
            checkForErrors([result]);
        } catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    });
}

export function getSuffix(label: string): string {
    if(label === BLUE_GREEN_NEW_LABEL_VALUE) {
        return BLUE_GREEN_SUFFIX
    } else {
        return '';
    }
}

// other common functions
export function getManifestObjects (filePaths: string[]): any {
    const deploymentEntityList = [];
    const serviceEntityList = [];
    const ingressEntityList = [];
    const otherEntitiesList = [];
    filePaths.forEach((filePath: string) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            if(!!inputObject) {
                const kind = inputObject.kind;
                if (helper.isDeploymentEntity(kind)) {
                    deploymentEntityList.push(inputObject);
                } else if (helper.isServiceEntity(kind)) {
                    serviceEntityList.push(inputObject);
                } else if (helper.isIngressEntity(kind)) {
                    ingressEntityList.push(inputObject);
                } else {
                    otherEntitiesList.push(inputObject);
                }
            }
        });
    })

    let serviceNameMap = new Map<string, string>();
    // find all services and adding they names with blue green suffix 
    serviceEntityList.forEach(inputObject => {
        const name = inputObject.metadata.name;
        serviceNameMap.set(name, getBlueGreenResourceName(name, BLUE_GREEN_SUFFIX));
    });
     
    return { serviceEntityList: serviceEntityList, serviceNameMap: serviceNameMap, deploymentEntityList: deploymentEntityList, ingressEntityList: ingressEntityList, otherObjects: otherEntitiesList };
}

export function createWorkloadssWithLabel(kubectl: Kubectl, depObjectList: any[], nextLabel: string) {
    const newObjectsList = [];
    depObjectList.forEach((inputObject) => {
        const blueGreenReplicaCount = helper.getReplicaCount(inputObject);
        // creating deployment with label
        const newBlueGreenObject = getNewBlueGreenObject(inputObject, blueGreenReplicaCount, nextLabel);
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    const result = kubectl.apply(manifestFiles);

    return { 'result': result, 'newFilePaths': manifestFiles };
}

export function getNewBlueGreenObject(inputObject: any, replicas: number, labelValue: string): object {
    const newObject = JSON.parse(JSON.stringify(inputObject));

    // Updating name only if label is green label is given
    if (labelValue === BLUE_GREEN_NEW_LABEL_VALUE) {
        newObject.metadata.name = getBlueGreenResourceName(inputObject.metadata.name, BLUE_GREEN_SUFFIX);
    }

    // Adding labels and annotations
    addBlueGreenLabelsAndAnnotations(newObject, labelValue);

    // Updating no. of replicas
    if (isSpecContainsReplicas(newObject.kind)) {
        newObject.spec.replicas = replicas;
    }
    return newObject;
}

export function addBlueGreenLabelsAndAnnotations(inputObject: any, labelValue: string) {
    //creating the k8s.deploy.color label
    const newLabels = new Map<string, string>();
    newLabels[BLUE_GREEN_VERSION_LABEL] = labelValue;

    // updating object labels and selector labels
    helper.updateObjectLabels(inputObject, newLabels, false);
    helper.updateSelectorLabels(inputObject, newLabels, false);

    // updating spec labels if it is a service
    if (!helper.isServiceEntity(inputObject.kind)) {
        helper.updateSpecLabels(inputObject, newLabels, false);
    }
}

function isSpecContainsReplicas(kind: string) {
    return !isEqual(kind, KubernetesWorkload.pod, StringComparer.OrdinalIgnoreCase) &&
        !isEqual(kind, KubernetesWorkload.daemonSet, StringComparer.OrdinalIgnoreCase) &&
        !helper.isServiceEntity(kind)
}

export function getBlueGreenResourceName(name: string, suffix: string) {
    return name + suffix;
}


export function getSpecLabel(inputObject: any): string {
    if(!!inputObject && inputObject.spec && inputObject.spec.selector && inputObject.spec.selector.matchLabels && inputObject.spec.selector.matchLabels[BLUE_GREEN_VERSION_LABEL]) {
        return inputObject.spec.selector.matchLabels[BLUE_GREEN_VERSION_LABEL]; 
    }
    return '';
}

export function getDeploymentMatchLabels(inputObject) {
    if (inputObject.kind.toUpperCase()=='POD' && !!inputObject && !!inputObject.metadata && !!inputObject.metadata.labels) {
        return JSON.stringify(inputObject.metadata.labels);
    } else if (!!inputObject && inputObject.spec && inputObject.spec.selector && inputObject.spec.selector.matchLabels) {
        return JSON.stringify(inputObject.spec.selector.matchLabels);
    }
    return false;
}

export function getServiceSelector(inputObject: any) {
    if (!!inputObject && inputObject.spec && inputObject.spec.selector) {
        return JSON.stringify(inputObject.spec.selector);
    } else return false;
}

export function fetchResource(kubectl: Kubectl, kind: string, name: string) {
    const result = kubectl.getResource(kind, name);
    if (result == null || !!result.stderr) {
        return null;
    }

    if (!!result.stdout) {
        const resource = JSON.parse(result.stdout);
        try {
            UnsetsClusterSpecficDetails(resource);
            return resource;
        } catch (ex) {
            core.debug('Exception occurred while Parsing ' + resource + ' in Json object');
            core.debug(`Exception:${ex}`);
        }
    }
    return null;
}

function UnsetsClusterSpecficDetails(resource: any) {
    if (resource == null) {
        return;
    }

    // Unsets the cluster specific details in the object
    if (!!resource) {
        const metadata = resource.metadata;
        const status = resource.status;

        if (!!metadata) {
            const newMetadata = {
                'annotations': metadata.annotations,
                'labels': metadata.labels,
                'name': metadata.name
            };

            resource.metadata = newMetadata;
        }

        if (!!status) {
            resource.status = {};
        }
    }
}