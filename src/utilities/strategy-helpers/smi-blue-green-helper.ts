'use strict';

import { Kubectl } from '../../kubectl-object-model';
import * as kubectlUtils from '../kubectl-util';
import * as fileHelper from '../files-helper';
import { createWorkloadsWithLabel, getManifestObjects, fetchResource, deleteWorkloadsWithLabel, cleanUp, getNewBlueGreenObject, getBlueGreenResourceName, isServiceRouted, deleteObjects } from './blue-green-helper';
import { GREEN_LABEL_VALUE, NONE_LABEL_VALUE, GREEN_SUFFIX, STABLE_SUFFIX } from './blue-green-helper';

let trafficSplitAPIVersion = "";
const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = '-trafficsplit';
const TRAFFIC_SPLIT_OBJECT = 'TrafficSplit';
const MIN_VAL = '0';
const MAX_VAL = '100';

export function deployBlueGreenSMI(kubectl: Kubectl, filePaths: string[]) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = getManifestObjects(filePaths);

    // creating services and other objects
    const newObjectsList = manifestObjects.otherObjects.concat(manifestObjects.serviceEntityList).concat(manifestObjects.ingressEntityList);
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);

    // make extraservices and trafficsplit
    setupSMI(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);

    // create new deloyments
    const result = createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, GREEN_LABEL_VALUE);

    // return results to check for manifest stability
    return result;
}

export async function promoteBlueGreenSMI(kubectl: Kubectl, manifestObjects) {
    // checking if there is something to promote
    if (!validateTrafficSplitState(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList)) {
        throw('NotInPromoteStateSMI')
    } 

    // create stable deployments with new configuration
    const result = createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, NONE_LABEL_VALUE);

    // return result to check for stability
    return result;
}

export async function blueGreenRejectSMI(kubectl: Kubectl, filePaths: string[]) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = getManifestObjects(filePaths);

    // routing trafficsplit to stable deploymetns
    routeBlueGreenSMI(kubectl, NONE_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);

    // deciding whether to delete services or not
    cleanUp(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);

    // deleting rejected new bluegreen deplyments 
    deleteWorkloadsWithLabel(kubectl, GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);

    //deleting trafficsplit and extra services
    cleanupSMI(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
}

export function setupSMI(kubectl: Kubectl, deploymentEntityList: any[], serviceEntityList: any[]) {
    const newObjectsList = [];
    const trafficObjectList = []
    serviceEntityList.forEach((serviceObject) => {
        if (isServiceRouted(serviceObject, deploymentEntityList)) {
            // create a trafficsplit for service
            trafficObjectList.push(serviceObject);
            // setting up the services for trafficsplit
            const newStableService = getSMIServiceResource(serviceObject, STABLE_SUFFIX);
            const newGreenService = getSMIServiceResource(serviceObject, GREEN_SUFFIX);
            newObjectsList.push(newStableService);
            newObjectsList.push(newGreenService);
        }
    });

    // creating services
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);

    // route to stable service
    trafficObjectList.forEach((inputObject) => {
        createTrafficSplitObject(kubectl, inputObject.metadata.name, NONE_LABEL_VALUE);
    });
}

function createTrafficSplitObject(kubectl: Kubectl ,name: string, nextLabel: string): any {
    // getting smi spec api version 
    trafficSplitAPIVersion = kubectlUtils.getTrafficSplitAPIVersion(kubectl);

    // deciding weights based on nextlabel
    let stableWeight: number;
    let greenWeight: number;
    if (nextLabel === GREEN_LABEL_VALUE) {
        stableWeight = parseInt(MIN_VAL);
        greenWeight = parseInt(MAX_VAL);
    } else {
        stableWeight = parseInt(MAX_VAL);
        greenWeight = parseInt(MIN_VAL);
    }

    //traffic split json
    const trafficSplitObject = `{
        "apiVersion": "${trafficSplitAPIVersion}",
        "kind": "TrafficSplit",
        "metadata": {
            "name": "${getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX)}"
        },
        "spec": {
            "service": "${name}",
            "backends": [
                {
                    "service": "${getBlueGreenResourceName(name, STABLE_SUFFIX)}",
                    "weight": ${stableWeight}
                },
                {
                    "service": "${getBlueGreenResourceName(name, GREEN_SUFFIX)}",
                    "weight": ${greenWeight}
                }
            ]
        }
    }`;

    // creating trafficplit object
    const trafficSplitManifestFile = fileHelper.writeManifestToFile(trafficSplitObject, TRAFFIC_SPLIT_OBJECT, getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX));
    kubectl.apply(trafficSplitManifestFile);
}

export function getSMIServiceResource(inputObject: any, suffix: string): object {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    if (suffix === STABLE_SUFFIX) {
        // adding stable suffix to service name
        newObject.metadata.name = getBlueGreenResourceName(inputObject.metadata.name, STABLE_SUFFIX)
        return getNewBlueGreenObject(newObject, NONE_LABEL_VALUE);
    } else {
        // green label will be added for these
        return getNewBlueGreenObject(newObject, GREEN_LABEL_VALUE);
    }
}

export function routeBlueGreenSMI(kubectl: Kubectl, nextLabel: string, deploymentEntityList: any[], serviceEntityList: any[]) {
    serviceEntityList.forEach((serviceObject) => {
        if (isServiceRouted(serviceObject, deploymentEntityList)) {
            // routing trafficsplit to given label
            createTrafficSplitObject(kubectl, serviceObject.metadata.name, nextLabel);
        }
    });
}

export function validateTrafficSplitState(kubectl: Kubectl, deploymentEntityList: any[], serviceEntityList: any[]): boolean {  
    let isTrafficSplitInRightState: boolean = true;
    serviceEntityList.forEach((serviceObject) => {
        if (isServiceRouted(serviceObject, deploymentEntityList)) {
            const name = serviceObject.metadata.name;
            let trafficSplitObject = fetchResource(kubectl, TRAFFIC_SPLIT_OBJECT, getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX));
            if (!trafficSplitObject) {
                // no trafficplit exits
                isTrafficSplitInRightState = false;
            }
            trafficSplitObject = JSON.parse(JSON.stringify(trafficSplitObject));
            trafficSplitObject.spec.backends.forEach(element => {
                // checking if trafficsplit in right state to deploy
                if (element.service === getBlueGreenResourceName(name, GREEN_SUFFIX)) {
                    if (element.weight == MAX_VAL) {
                    } else {
                        // green service should have max weight
                        isTrafficSplitInRightState = false;
                    }
                } 

                if (element.service === getBlueGreenResourceName(name, STABLE_SUFFIX)) {
                    if (element.weight == MIN_VAL) {
                    } else {
                        // stable service should have 0 weight
                        isTrafficSplitInRightState = false;
                    }
                } 
            });
        }
    });               
    
    return isTrafficSplitInRightState;
}

export function cleanupSMI(kubectl: Kubectl, deploymentEntityList: any[], serviceEntityList: any[]) { 
    const deleteList = [];
    serviceEntityList.forEach((serviceObject) => {
        if (isServiceRouted(serviceObject, deploymentEntityList)) {
            deleteList.push({name: getBlueGreenResourceName(serviceObject.metadata.name, GREEN_SUFFIX), kind: serviceObject.kind});
            deleteList.push({name: getBlueGreenResourceName(serviceObject.metadata.name, STABLE_SUFFIX), kind: serviceObject.kind});
            deleteList.push({name: getBlueGreenResourceName(serviceObject.metadata.name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX), kind: TRAFFIC_SPLIT_OBJECT});
        }
    });

    // deleting all objects
    deleteObjects(kubectl, deleteList);
}
