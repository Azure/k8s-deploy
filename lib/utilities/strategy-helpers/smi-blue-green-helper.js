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
exports.cleanupSMI = exports.validateTrafficSplitsState = exports.routeBlueGreenSMI = exports.getSMIServiceResource = exports.setupSMI = exports.rejectBlueGreenSMI = exports.promoteBlueGreenSMI = exports.deployBlueGreenSMI = void 0;
const kubectlUtils = require("../kubectl-util");
const fileHelper = require("../files-helper");
const blue_green_helper_1 = require("./blue-green-helper");
const blue_green_helper_2 = require("./blue-green-helper");
let trafficSplitAPIVersion = "";
const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = '-trafficsplit';
const TRAFFIC_SPLIT_OBJECT = 'TrafficSplit';
const MIN_VAL = '0';
const MAX_VAL = '100';
function deployBlueGreenSMI(kubectl, filePaths) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
    // creating services and other objects
    const newObjectsList = manifestObjects.otherObjects.concat(manifestObjects.serviceEntityList).concat(manifestObjects.ingressEntityList).concat(manifestObjects.unroutedServiceEntityList);
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    // make extraservices and trafficsplit
    setupSMI(kubectl, manifestObjects.serviceEntityList);
    // create new deloyments
    const result = blue_green_helper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.GREEN_LABEL_VALUE);
    // return results to check for manifest stability
    return result;
}
exports.deployBlueGreenSMI = deployBlueGreenSMI;
function promoteBlueGreenSMI(kubectl, manifestObjects) {
    return __awaiter(this, void 0, void 0, function* () {
        // checking if there is something to promote
        if (!validateTrafficSplitsState(kubectl, manifestObjects.serviceEntityList)) {
            throw ('NotInPromoteStateSMI');
        }
        // create stable deployments with new configuration
        const result = blue_green_helper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.NONE_LABEL_VALUE);
        // return result to check for stability
        return result;
    });
}
exports.promoteBlueGreenSMI = promoteBlueGreenSMI;
function rejectBlueGreenSMI(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
        // routing trafficsplit to stable deploymetns
        routeBlueGreenSMI(kubectl, blue_green_helper_2.NONE_LABEL_VALUE, manifestObjects.serviceEntityList);
        // deleting rejected new bluegreen deplyments 
        blue_green_helper_1.deleteWorkloadsWithLabel(kubectl, blue_green_helper_2.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
        //deleting trafficsplit and extra services
        cleanupSMI(kubectl, manifestObjects.serviceEntityList);
    });
}
exports.rejectBlueGreenSMI = rejectBlueGreenSMI;
function setupSMI(kubectl, serviceEntityList) {
    const newObjectsList = [];
    const trafficObjectList = [];
    serviceEntityList.forEach((serviceObject) => {
        // create a trafficsplit for service
        trafficObjectList.push(serviceObject);
        // setting up the services for trafficsplit
        const newStableService = getSMIServiceResource(serviceObject, blue_green_helper_2.STABLE_SUFFIX);
        const newGreenService = getSMIServiceResource(serviceObject, blue_green_helper_2.GREEN_SUFFIX);
        newObjectsList.push(newStableService);
        newObjectsList.push(newGreenService);
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
    if (!trafficSplitAPIVersion) {
        trafficSplitAPIVersion = kubectlUtils.getTrafficSplitAPIVersion(kubectl);
    }
    // deciding weights based on nextlabel
    let stableWeight;
    let greenWeight;
    if (nextLabel === blue_green_helper_2.GREEN_LABEL_VALUE) {
        stableWeight = parseInt(MIN_VAL);
        greenWeight = parseInt(MAX_VAL);
    }
    else {
        stableWeight = parseInt(MAX_VAL);
        greenWeight = parseInt(MIN_VAL);
    }
    //traffic split json
    const trafficSplitObject = `{
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
                    "service": "${blue_green_helper_1.getBlueGreenResourceName(name, blue_green_helper_2.GREEN_SUFFIX)}",
                    "weight": ${greenWeight}
                }
            ]
        }
    }`;
    // creating trafficplit object
    const trafficSplitManifestFile = fileHelper.writeManifestToFile(trafficSplitObject, TRAFFIC_SPLIT_OBJECT, blue_green_helper_1.getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX));
    kubectl.apply(trafficSplitManifestFile);
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
        return blue_green_helper_1.getNewBlueGreenObject(newObject, blue_green_helper_2.GREEN_LABEL_VALUE);
    }
}
exports.getSMIServiceResource = getSMIServiceResource;
function routeBlueGreenSMI(kubectl, nextLabel, serviceEntityList) {
    serviceEntityList.forEach((serviceObject) => {
        // routing trafficsplit to given label
        createTrafficSplitObject(kubectl, serviceObject.metadata.name, nextLabel);
    });
}
exports.routeBlueGreenSMI = routeBlueGreenSMI;
function validateTrafficSplitsState(kubectl, serviceEntityList) {
    let areTrafficSplitsInRightState = true;
    serviceEntityList.forEach((serviceObject) => {
        const name = serviceObject.metadata.name;
        let trafficSplitObject = blue_green_helper_1.fetchResource(kubectl, TRAFFIC_SPLIT_OBJECT, blue_green_helper_1.getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX));
        if (!trafficSplitObject) {
            // no trafficplit exits
            areTrafficSplitsInRightState = false;
        }
        trafficSplitObject = JSON.parse(JSON.stringify(trafficSplitObject));
        trafficSplitObject.spec.backends.forEach(element => {
            // checking if trafficsplit in right state to deploy
            if (element.service === blue_green_helper_1.getBlueGreenResourceName(name, blue_green_helper_2.GREEN_SUFFIX)) {
                if (element.weight != MAX_VAL) {
                    // green service should have max weight
                    areTrafficSplitsInRightState = false;
                }
            }
            if (element.service === blue_green_helper_1.getBlueGreenResourceName(name, blue_green_helper_2.STABLE_SUFFIX)) {
                if (element.weight != MIN_VAL) {
                    // stable service should have 0 weight
                    areTrafficSplitsInRightState = false;
                }
            }
        });
    });
    return areTrafficSplitsInRightState;
}
exports.validateTrafficSplitsState = validateTrafficSplitsState;
function cleanupSMI(kubectl, serviceEntityList) {
    const deleteList = [];
    serviceEntityList.forEach((serviceObject) => {
        deleteList.push({ name: blue_green_helper_1.getBlueGreenResourceName(serviceObject.metadata.name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX), kind: TRAFFIC_SPLIT_OBJECT });
        deleteList.push({ name: blue_green_helper_1.getBlueGreenResourceName(serviceObject.metadata.name, blue_green_helper_2.GREEN_SUFFIX), kind: serviceObject.kind });
        deleteList.push({ name: blue_green_helper_1.getBlueGreenResourceName(serviceObject.metadata.name, blue_green_helper_2.STABLE_SUFFIX), kind: serviceObject.kind });
    });
    // deleting all objects
    blue_green_helper_1.deleteObjects(kubectl, deleteList);
}
exports.cleanupSMI = cleanupSMI;
