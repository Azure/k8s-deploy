'use strict';

import { checkForErrors } from '../utility';
import * as util from 'util';
import { Kubectl } from '../../kubectl-object-model';
import * as kubectlUtils from '../kubectl-util';
import * as fileHelper from '../files-helper';
import * as TaskInputParameters from '../../input-parameters';
import { createWorkloadssWithLabel, getManifestObjects, getServiceSelector, getDeploymentMatchLabels, fetchResource, deleteWorkloadsWithLabel, cleanUp, getNewBlueGreenObject, getBlueGreenResourceName } from './blue-green-helper';
import { BLUE_GREEN_NEW_LABEL_VALUE, NONE_LABEL_VALUE, BLUE_GREEN_SUFFIX, STABLE_SUFFIX } from './blue-green-helper';

let trafficSplitAPIVersion = "";
const SMI_ROUTE = 'SMI';
const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = '-rollout';
const TRAFFIC_SPLIT_OBJECT = 'TrafficSplit';
const MIN_VAL = '0';
const MAX_VAL = '100';

export function isSMIRoute(): boolean {
    const routeMethod = TaskInputParameters.routeMethod;
    return routeMethod && routeMethod.toUpperCase() === SMI_ROUTE;
}

export function deployBlueGreenSMI(kubectl: Kubectl, filePaths: string[]) {

    // get all kubernetes objects defined in manifest files
    const manifestObjects = getManifestObjects(filePaths);

    // creating services and other objects
    const newObjectsList = manifestObjects.otherObjects.concat(manifestObjects.serviceEntityList).concat(manifestObjects.ingressEntityList);
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);

    // make extraservices and trafficsplit
    setUpSMI(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);

    // create new deloyments
    const result = createWorkloadssWithLabel(kubectl, manifestObjects.deploymentEntityList, BLUE_GREEN_NEW_LABEL_VALUE);

    // return results to check for manifest stability
    return result;
}

export async function blueGreenPromoteSMI(kubectl: Kubectl, manifestObjects) {

    // checking if there is something to promote
    if (!validateTrafficSplitState(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList)) {
        throw('NotInPromoteStateSMI')
    } 

    //deleting old stable deployments
    deleteWorkloadsWithLabel(kubectl, NONE_LABEL_VALUE, manifestObjects.deploymentEntityList);

    // create stable deployments with new configuration
    const result = createWorkloadssWithLabel(kubectl, manifestObjects.deploymentEntityList, NONE_LABEL_VALUE);

    // return result to check for stability
    return result;
}

export async function blueGreenRejectSMI(kubectl: Kubectl, filePaths: string[]) {

    // get all kubernetes objects defined in manifest files
    const manifestObjects = getManifestObjects(filePaths);

    // routing trafficsplit to stable deploymetns
    blueGreenRouteTraffic(kubectl, NONE_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);

    // deciding whether to delete services or not
    cleanUp(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);

    // deleting rejected new bluegreen deplyments 
    deleteWorkloadsWithLabel(kubectl, BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.deploymentEntityList);

    //deleting trafficsplit and extra services
    cleanSetUpSMI(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
}

export function setUpSMI(kubectl: Kubectl, deploymentEntityList: any[], serviceEntityList: any[]) {

    const newObjectsList = [];
    const trafficObjectList = []
    serviceEntityList.forEach((inputObject) => {
        deploymentEntityList.forEach((depObject) => {
            // finding out whether service targets a deployment in given manifests
            if (getServiceSelector(inputObject) && getDeploymentMatchLabels(depObject) && getServiceSelector(inputObject) === getDeploymentMatchLabels(depObject)) {
                // decided that this service needs to be routed
                //querying for both services
                trafficObjectList.push(inputObject);
                // setting up the services for trafficsplit
                const newStableService = getSMIServiceResource(inputObject, STABLE_SUFFIX, 0);
                const newGreenService = getSMIServiceResource(inputObject, BLUE_GREEN_SUFFIX, 0);
                newObjectsList.push(newStableService);
                newObjectsList.push(newGreenService);
            }
        });
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
    if (nextLabel === BLUE_GREEN_NEW_LABEL_VALUE) {
        stableWeight = parseInt(MIN_VAL);
        greenWeight = parseInt(MAX_VAL);
    } else {
        stableWeight = parseInt(MAX_VAL);
        greenWeight = parseInt(MIN_VAL);
    }

    //traffic split json
    const trafficSplitObjectJson = `{
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
                    "service": "${getBlueGreenResourceName(name, BLUE_GREEN_SUFFIX)}",
                    "weight": ${greenWeight}
                }
            ]
        }
    }`;
    let trafficSplitObject = util.format(trafficSplitObjectJson);

    // creaeting trafficplit object
    trafficSplitObject = fileHelper.writeManifestToFile(trafficSplitObject, TRAFFIC_SPLIT_OBJECT, getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX));
    kubectl.apply(trafficSplitObject);
}

export function getSMIServiceResource(inputObject: any, suffix: string, replicas?: number): object {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    if (suffix === STABLE_SUFFIX) {
        // adding stable suffix to service name
        newObject.metadata.name = getBlueGreenResourceName(inputObject.metadata.name, STABLE_SUFFIX)
        return getNewBlueGreenObject(newObject, replicas, NONE_LABEL_VALUE);
    } else {
        // green label will be added for these
        return getNewBlueGreenObject(newObject, replicas, BLUE_GREEN_NEW_LABEL_VALUE);
    }
}

export function blueGreenRouteTraffic(kubectl: Kubectl, nextLabel: string, deploymentEntityList: any[], serviceEntityList: any[]) {
    
    serviceEntityList.forEach((inputObject) => {
        deploymentEntityList.forEach((depObject) => {
            // finding out whether service targets a deployment in given manifests
            if (getServiceSelector(inputObject) && getDeploymentMatchLabels(depObject) && getServiceSelector(inputObject) === getDeploymentMatchLabels(depObject)) {
                // decided that this service needs to be routed
                // point to blue green entities
                createTrafficSplitObject(kubectl, inputObject.metadata.name, nextLabel);
            }
        });
    });
}

export function validateTrafficSplitState(kubectl: Kubectl, deploymentEntityList: any[], serviceEntityList: any[]): boolean {
    
    let isTrafficSplitInRightState: boolean = true;
    serviceEntityList.forEach((inputObject) => {
        const name: string = inputObject.metadata.name;  
        deploymentEntityList.forEach((depObject) => {
            // seeing if given service targets a corresponding deployment in given manifest
            if (getServiceSelector(inputObject) && getDeploymentMatchLabels(depObject) && getServiceSelector(inputObject) === getDeploymentMatchLabels(depObject)) {
                // querying existing trafficsplit object
                let trafficSplitObject = fetchResource(kubectl, TRAFFIC_SPLIT_OBJECT, name+TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX);
                if (!trafficSplitObject) {
                    // no trafficplit exits
                    isTrafficSplitInRightState = false;
                }
                trafficSplitObject = JSON.parse(JSON.stringify(trafficSplitObject));
                trafficSplitObject.spec.backends.forEach(element => {
                    // checking if trafficsplit in right state to deploy
                    if (element.service === name+BLUE_GREEN_SUFFIX) {
                        if (element.weight == MAX_VAL) {
                        } else {
                            // green service should have max weight
                            isTrafficSplitInRightState = false;
                        }
                    } 

                    if (element.service === name+STABLE_SUFFIX) {
                        if (element.weight == MIN_VAL) {
                        } else {
                            // stable service should have 0 weight
                            isTrafficSplitInRightState = false;
                        }
                    } 
                });
            }
        });
    });               
    
    return isTrafficSplitInRightState;
}

export function cleanSetUpSMI(kubectl: Kubectl, deploymentEntityList: any[], serviceEntityList: any[]) {
    
    const delList = [];
    serviceEntityList.forEach((inputObject) => {
        deploymentEntityList.forEach((depObject) => {
            // finding out whether service targets a deployment in given manifests
            if (getServiceSelector(inputObject) && getDeploymentMatchLabels(depObject) && getServiceSelector(inputObject) === getDeploymentMatchLabels(depObject)) {
                delList.push({name: inputObject.metadata.name+BLUE_GREEN_SUFFIX, kind: inputObject.kind});
                delList.push({name: inputObject.metadata.name+STABLE_SUFFIX, kind: inputObject.kind});
                delList.push({name: inputObject.metadata.name+TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX, kind: TRAFFIC_SPLIT_OBJECT});
            }
        });
    });

    // deleting all objects
    delList.forEach((delObject) => {
        try {
            const result = kubectl.delete([delObject.kind, delObject.name]);
            checkForErrors([result]);
        } catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    });
}
