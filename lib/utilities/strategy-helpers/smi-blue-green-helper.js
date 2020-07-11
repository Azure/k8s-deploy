'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupSMI = exports.validateTrafficSplitState = exports.routeBlueGreenSMI = exports.getSMIServiceResource = exports.setupSMI = exports.blueGreenRejectSMI = exports.blueGreenPromoteSMI = exports.deployBlueGreenSMI = void 0;
const utility_1 = require("../utility");
const util = require("util");
const kubectlUtils = require("../kubectl-util");
const fileHelper = require("../files-helper");
const blue_green_helper_1 = require("./blue-green-helper");
const blue_green_helper_2 = require("./blue-green-helper");
let trafficSplitAPIVersion = "";
const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = '-rollout';
const TRAFFIC_SPLIT_OBJECT = 'TrafficSplit';
const MIN_VAL = '0';
const MAX_VAL = '100';
function deployBlueGreenSMI(kubectl, filePaths) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
    // creating services and other objects
    const newObjectsList = manifestObjects.otherObjects.concat(manifestObjects.serviceEntityList).concat(manifestObjects.ingressEntityList);
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    // make extraservices and trafficsplit
    setupSMI(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
    // create new deloyments
    const result = blue_green_helper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE);
    // return results to check for manifest stability
    return result;
}
exports.deployBlueGreenSMI = deployBlueGreenSMI;
function blueGreenPromoteSMI(kubectl, manifestObjects) {
    return __awaiter(this, void 0, void 0, function* () {
        // checking if there is something to promote
        if (!validateTrafficSplitState(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList)) {
            throw ('NotInPromoteStateSMI');
        }
        //deleting old stable deployments
        blue_green_helper_1.deleteWorkloadsWithLabel(kubectl, blue_green_helper_2.NONE_LABEL_VALUE, manifestObjects.deploymentEntityList);
        // create stable deployments with new configuration
        const result = blue_green_helper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.NONE_LABEL_VALUE);
        // return result to check for stability
        return result;
    });
}
exports.blueGreenPromoteSMI = blueGreenPromoteSMI;
function blueGreenRejectSMI(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
        // routing trafficsplit to stable deploymetns
        routeBlueGreenSMI(kubectl, blue_green_helper_2.NONE_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
        // deciding whether to delete services or not
        blue_green_helper_1.cleanUp(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
        // deleting rejected new bluegreen deplyments 
        blue_green_helper_1.deleteWorkloadsWithLabel(kubectl, blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.deploymentEntityList);
        //deleting trafficsplit and extra services
        cleanupSMI(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
    });
}
exports.blueGreenRejectSMI = blueGreenRejectSMI;
function setupSMI(kubectl, deploymentEntityList, serviceEntityList) {
    const newObjectsList = [];
    const trafficObjectList = [];
    serviceEntityList.forEach((inputObject) => {
        deploymentEntityList.forEach((depObject) => {
            // finding out whether service targets a deployment in given manifests
            const serviceSelector = blue_green_helper_1.getServiceSelector(inputObject);
            const matchLabels = blue_green_helper_1.getDeploymentMatchLabels(depObject);
            if (!!serviceSelector && !!matchLabels && blue_green_helper_1.isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels)) {
                // decided that this service needs to be routed
                //querying for both services
                trafficObjectList.push(inputObject);
                // setting up the services for trafficsplit
                const newStableService = getSMIServiceResource(inputObject, blue_green_helper_2.STABLE_SUFFIX);
                const newGreenService = getSMIServiceResource(inputObject, blue_green_helper_2.BLUE_GREEN_SUFFIX);
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
        createTrafficSplitObject(kubectl, inputObject.metadata.name, blue_green_helper_2.NONE_LABEL_VALUE);
    });
}
exports.setupSMI = setupSMI;
function createTrafficSplitObject(kubectl, name, nextLabel) {
    // getting smi spec api version 
    trafficSplitAPIVersion = kubectlUtils.getTrafficSplitAPIVersion(kubectl);
    // deciding weights based on nextlabel
    let stableWeight;
    let greenWeight;
    if (nextLabel === blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE) {
        stableWeight = parseInt(MIN_VAL);
        greenWeight = parseInt(MAX_VAL);
    }
    else {
        stableWeight = parseInt(MAX_VAL);
        greenWeight = parseInt(MIN_VAL);
    }
    //traffic split json
    const trafficSplitObjectJson = `{
        "apiVersion": "${trafficSplitAPIVersion}",
        "kind": "TrafficSplit",
        "metadata": {
            "name": "${blue_green_helper_1.getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX)}"
        },
        "spec": {
            "service": "${name}",
            "backends": [
                {
                    "service": "${blue_green_helper_1.getBlueGreenResourceName(name, blue_green_helper_2.STABLE_SUFFIX)}",
                    "weight": ${stableWeight}
                },
                {
                    "service": "${blue_green_helper_1.getBlueGreenResourceName(name, blue_green_helper_2.BLUE_GREEN_SUFFIX)}",
                    "weight": ${greenWeight}
                }
            ]
        }
    }`;
    let trafficSplitObject = util.format(trafficSplitObjectJson);
    // creating trafficplit object
    trafficSplitObject = fileHelper.writeManifestToFile(trafficSplitObject, TRAFFIC_SPLIT_OBJECT, blue_green_helper_1.getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX));
    kubectl.apply(trafficSplitObject);
}
function getSMIServiceResource(inputObject, suffix) {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    if (suffix === blue_green_helper_2.STABLE_SUFFIX) {
        // adding stable suffix to service name
        newObject.metadata.name = blue_green_helper_1.getBlueGreenResourceName(inputObject.metadata.name, blue_green_helper_2.STABLE_SUFFIX);
        return blue_green_helper_1.getNewBlueGreenObject(newObject, blue_green_helper_2.NONE_LABEL_VALUE);
    }
    else {
        // green label will be added for these
        return blue_green_helper_1.getNewBlueGreenObject(newObject, blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE);
    }
}
exports.getSMIServiceResource = getSMIServiceResource;
function routeBlueGreenSMI(kubectl, nextLabel, deploymentEntityList, serviceEntityList) {
    serviceEntityList.forEach((inputObject) => {
        deploymentEntityList.forEach((depObject) => {
            // finding out whether service targets a deployment in given manifests
            const serviceSelector = blue_green_helper_1.getServiceSelector(inputObject);
            const matchLabels = blue_green_helper_1.getDeploymentMatchLabels(depObject);
            if (!!serviceSelector && !!matchLabels && blue_green_helper_1.isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels)) {
                // decided that this service needs to be routed
                // point to blue green entities
                createTrafficSplitObject(kubectl, inputObject.metadata.name, nextLabel);
            }
        });
    });
}
exports.routeBlueGreenSMI = routeBlueGreenSMI;
function validateTrafficSplitState(kubectl, deploymentEntityList, serviceEntityList) {
    let isTrafficSplitInRightState = true;
    serviceEntityList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        deploymentEntityList.forEach((depObject) => {
            // seeing if given service targets a corresponding deployment in given manifest
            const serviceSelector = blue_green_helper_1.getServiceSelector(inputObject);
            const matchLabels = blue_green_helper_1.getDeploymentMatchLabels(depObject);
            if (!!serviceSelector && !!matchLabels && blue_green_helper_1.isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels)) {
                // querying existing trafficsplit object
                let trafficSplitObject = blue_green_helper_1.fetchResource(kubectl, TRAFFIC_SPLIT_OBJECT, name + TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX);
                if (!trafficSplitObject) {
                    // no trafficplit exits
                    isTrafficSplitInRightState = false;
                }
                trafficSplitObject = JSON.parse(JSON.stringify(trafficSplitObject));
                trafficSplitObject.spec.backends.forEach(element => {
                    // checking if trafficsplit in right state to deploy
                    if (element.service === name + blue_green_helper_2.BLUE_GREEN_SUFFIX) {
                        if (element.weight == MAX_VAL) {
                        }
                        else {
                            // green service should have max weight
                            isTrafficSplitInRightState = false;
                        }
                    }
                    if (element.service === name + blue_green_helper_2.STABLE_SUFFIX) {
                        if (element.weight == MIN_VAL) {
                        }
                        else {
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
exports.validateTrafficSplitState = validateTrafficSplitState;
function cleanupSMI(kubectl, deploymentEntityList, serviceEntityList) {
    const deleteList = [];
    serviceEntityList.forEach((inputObject) => {
        deploymentEntityList.forEach((depObject) => {
            // finding out whether service targets a deployment in given manifests
            const serviceSelector = blue_green_helper_1.getServiceSelector(inputObject);
            const matchLabels = blue_green_helper_1.getDeploymentMatchLabels(depObject);
            if (!!serviceSelector && !!matchLabels && blue_green_helper_1.isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels)) {
                deleteList.push({ name: inputObject.metadata.name + blue_green_helper_2.BLUE_GREEN_SUFFIX, kind: inputObject.kind });
                deleteList.push({ name: inputObject.metadata.name + blue_green_helper_2.STABLE_SUFFIX, kind: inputObject.kind });
                deleteList.push({ name: inputObject.metadata.name + TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX, kind: TRAFFIC_SPLIT_OBJECT });
            }
        });
    });
    // deleting all objects
    deleteList.forEach((deleteObject) => {
        try {
            const result = kubectl.delete([deleteObject.kind, deleteObject.name]);
            utility_1.checkForErrors([result]);
        }
        catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    });
}
exports.cleanupSMI = cleanupSMI;
