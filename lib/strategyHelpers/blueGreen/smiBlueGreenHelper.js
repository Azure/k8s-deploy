"use strict";
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
const kubectlUtils = require("../../utilities/trafficSplitUtils");
const fileHelper = require("../../utilities/fileUtils");
const blueGreenHelper_1 = require("./blueGreenHelper");
const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = "-trafficsplit";
const TRAFFIC_SPLIT_OBJECT = "TrafficSplit";
const MIN_VAL = 0;
const MAX_VAL = 100;
function deployBlueGreenSMI(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blueGreenHelper_1.getManifestObjects(filePaths);
        // create services and other objects
        const newObjectsList = manifestObjects.otherObjects
            .concat(manifestObjects.serviceEntityList)
            .concat(manifestObjects.ingressEntityList)
            .concat(manifestObjects.unroutedServiceEntityList);
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        yield kubectl.apply(manifestFiles);
        // make extraservices and trafficsplit
        yield setupSMI(kubectl, manifestObjects.serviceEntityList);
        // create new deloyments
        return yield blueGreenHelper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blueGreenHelper_1.GREEN_LABEL_VALUE);
    });
}
exports.deployBlueGreenSMI = deployBlueGreenSMI;
function promoteBlueGreenSMI(kubectl, manifestObjects) {
    return __awaiter(this, void 0, void 0, function* () {
        // checking if there is something to promote
        if (!(yield validateTrafficSplitsState(kubectl, manifestObjects.serviceEntityList))) {
            throw Error("Not in promote state SMI");
        }
        // create stable deployments with new configuration
        return yield blueGreenHelper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blueGreenHelper_1.NONE_LABEL_VALUE);
    });
}
exports.promoteBlueGreenSMI = promoteBlueGreenSMI;
function rejectBlueGreenSMI(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blueGreenHelper_1.getManifestObjects(filePaths);
        // route trafficsplit to stable deploymetns
        yield routeBlueGreenSMI(kubectl, blueGreenHelper_1.NONE_LABEL_VALUE, manifestObjects.serviceEntityList);
        // delete rejected new bluegreen deployments
        yield blueGreenHelper_1.deleteWorkloadsWithLabel(kubectl, blueGreenHelper_1.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
        // delete trafficsplit and extra services
        yield cleanupSMI(kubectl, manifestObjects.serviceEntityList);
    });
}
exports.rejectBlueGreenSMI = rejectBlueGreenSMI;
function setupSMI(kubectl, serviceEntityList) {
    return __awaiter(this, void 0, void 0, function* () {
        const newObjectsList = [];
        const trafficObjectList = [];
        serviceEntityList.forEach((serviceObject) => {
            // create a trafficsplit for service
            trafficObjectList.push(serviceObject);
            // set up the services for trafficsplit
            const newStableService = getSMIServiceResource(serviceObject, blueGreenHelper_1.STABLE_SUFFIX);
            const newGreenService = getSMIServiceResource(serviceObject, blueGreenHelper_1.GREEN_SUFFIX);
            newObjectsList.push(newStableService);
            newObjectsList.push(newGreenService);
        });
        // create services
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        yield kubectl.apply(manifestFiles);
        // route to stable service
        trafficObjectList.forEach((inputObject) => {
            createTrafficSplitObject(kubectl, inputObject.metadata.name, blueGreenHelper_1.NONE_LABEL_VALUE);
        });
    });
}
exports.setupSMI = setupSMI;
let trafficSplitAPIVersion = "";
function createTrafficSplitObject(kubectl, name, nextLabel) {
    return __awaiter(this, void 0, void 0, function* () {
        // cache traffic split api version
        if (!trafficSplitAPIVersion)
            trafficSplitAPIVersion = yield kubectlUtils.getTrafficSplitAPIVersion(kubectl);
        // decide weights based on nextlabel
        const stableWeight = nextLabel === blueGreenHelper_1.GREEN_LABEL_VALUE ? MIN_VAL : MAX_VAL;
        const greenWeight = nextLabel === blueGreenHelper_1.GREEN_LABEL_VALUE ? MAX_VAL : MIN_VAL;
        const trafficSplitObject = JSON.stringify({
            apiVersion: trafficSplitAPIVersion,
            kind: "TrafficSplit",
            metadata: {
                name: blueGreenHelper_1.getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX),
            },
            spec: {
                service: name,
                backends: [
                    {
                        service: blueGreenHelper_1.getBlueGreenResourceName(name, blueGreenHelper_1.STABLE_SUFFIX),
                        weight: stableWeight,
                    },
                    {
                        service: blueGreenHelper_1.getBlueGreenResourceName(name, blueGreenHelper_1.GREEN_SUFFIX),
                        weight: greenWeight,
                    },
                ],
            },
        });
        // create traffic split object
        const trafficSplitManifestFile = fileHelper.writeManifestToFile(trafficSplitObject, TRAFFIC_SPLIT_OBJECT, blueGreenHelper_1.getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX));
        yield kubectl.apply(trafficSplitManifestFile);
    });
}
function getSMIServiceResource(inputObject, suffix) {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    if (suffix === blueGreenHelper_1.STABLE_SUFFIX) {
        // adding stable suffix to service name
        newObject.metadata.name = blueGreenHelper_1.getBlueGreenResourceName(inputObject.metadata.name, blueGreenHelper_1.STABLE_SUFFIX);
        return blueGreenHelper_1.getNewBlueGreenObject(newObject, blueGreenHelper_1.NONE_LABEL_VALUE);
    }
    else {
        // green label will be added for these
        return blueGreenHelper_1.getNewBlueGreenObject(newObject, blueGreenHelper_1.GREEN_LABEL_VALUE);
    }
}
exports.getSMIServiceResource = getSMIServiceResource;
function routeBlueGreenSMI(kubectl, nextLabel, serviceEntityList) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const serviceObject of serviceEntityList) {
            // route trafficsplit to given label
            yield createTrafficSplitObject(kubectl, serviceObject.metadata.name, nextLabel);
        }
    });
}
exports.routeBlueGreenSMI = routeBlueGreenSMI;
function validateTrafficSplitsState(kubectl, serviceEntityList) {
    return __awaiter(this, void 0, void 0, function* () {
        let trafficSplitsInRightState = true;
        for (const serviceObject of serviceEntityList) {
            const name = serviceObject.metadata.name;
            let trafficSplitObject = yield blueGreenHelper_1.fetchResource(kubectl, TRAFFIC_SPLIT_OBJECT, blueGreenHelper_1.getBlueGreenResourceName(name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX));
            if (!trafficSplitObject) {
                // no traffic split exits
                trafficSplitsInRightState = false;
            }
            trafficSplitObject = JSON.parse(JSON.stringify(trafficSplitObject));
            trafficSplitObject.spec.backends.forEach((element) => {
                // checking if trafficsplit in right state to deploy
                if (element.service === blueGreenHelper_1.getBlueGreenResourceName(name, blueGreenHelper_1.GREEN_SUFFIX)) {
                    if (element.weight != MAX_VAL)
                        trafficSplitsInRightState = false;
                }
                if (element.service === blueGreenHelper_1.getBlueGreenResourceName(name, blueGreenHelper_1.STABLE_SUFFIX)) {
                    if (element.weight != MIN_VAL)
                        trafficSplitsInRightState = false;
                }
            });
        }
        return trafficSplitsInRightState;
    });
}
exports.validateTrafficSplitsState = validateTrafficSplitsState;
function cleanupSMI(kubectl, serviceEntityList) {
    return __awaiter(this, void 0, void 0, function* () {
        const deleteList = [];
        serviceEntityList.forEach((serviceObject) => {
            deleteList.push({
                name: blueGreenHelper_1.getBlueGreenResourceName(serviceObject.metadata.name, TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX),
                kind: TRAFFIC_SPLIT_OBJECT,
            });
            deleteList.push({
                name: blueGreenHelper_1.getBlueGreenResourceName(serviceObject.metadata.name, blueGreenHelper_1.GREEN_SUFFIX),
                kind: serviceObject.kind,
            });
            deleteList.push({
                name: blueGreenHelper_1.getBlueGreenResourceName(serviceObject.metadata.name, blueGreenHelper_1.STABLE_SUFFIX),
                kind: serviceObject.kind,
            });
        });
        // delete all objects
        yield blueGreenHelper_1.deleteObjects(kubectl, deleteList);
    });
}
exports.cleanupSMI = cleanupSMI;
