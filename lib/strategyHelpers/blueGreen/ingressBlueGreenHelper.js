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
exports.updateIngressBackend = exports.getUpdatedBlueGreenIngress = exports.validateIngressesState = exports.routeBlueGreenIngress = exports.rejectBlueGreenIngress = exports.promoteBlueGreenIngress = exports.deployBlueGreenIngress = void 0;
const fileHelper = require("../../utilities/fileUtils");
const blueGreenHelper_1 = require("./blueGreenHelper");
const core = require("@actions/core");
const BACKEND = "BACKEND";
function deployBlueGreenIngress(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blueGreenHelper_1.getManifestObjects(filePaths);
        // create deployments with green label value
        const result = blueGreenHelper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blueGreenHelper_1.GREEN_LABEL_VALUE);
        // create new services and other objects
        let newObjectsList = [];
        manifestObjects.serviceEntityList.forEach((inputObject) => {
            const newBlueGreenObject = blueGreenHelper_1.getNewBlueGreenObject(inputObject, blueGreenHelper_1.GREEN_LABEL_VALUE);
            newObjectsList.push(newBlueGreenObject);
        });
        newObjectsList = newObjectsList
            .concat(manifestObjects.otherObjects)
            .concat(manifestObjects.unroutedServiceEntityList);
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        yield kubectl.apply(manifestFiles);
        return result;
    });
}
exports.deployBlueGreenIngress = deployBlueGreenIngress;
function promoteBlueGreenIngress(kubectl, manifestObjects) {
    return __awaiter(this, void 0, void 0, function* () {
        //checking if anything to promote
        if (!validateIngressesState(kubectl, manifestObjects.ingressEntityList, manifestObjects.serviceNameMap)) {
            throw "Ingress not in promote state";
        }
        // create stable deployments with new configuration
        const result = blueGreenHelper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blueGreenHelper_1.NONE_LABEL_VALUE);
        // create stable services with new configuration
        const newObjectsList = [];
        manifestObjects.serviceEntityList.forEach((inputObject) => {
            const newBlueGreenObject = blueGreenHelper_1.getNewBlueGreenObject(inputObject, blueGreenHelper_1.NONE_LABEL_VALUE);
            newObjectsList.push(newBlueGreenObject);
        });
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        yield kubectl.apply(manifestFiles);
        return result;
    });
}
exports.promoteBlueGreenIngress = promoteBlueGreenIngress;
function rejectBlueGreenIngress(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blueGreenHelper_1.getManifestObjects(filePaths);
        // route ingress to stables services
        yield routeBlueGreenIngress(kubectl, null, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);
        // delete green services and deployments
        yield blueGreenHelper_1.deleteWorkloadsAndServicesWithLabel(kubectl, blueGreenHelper_1.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
    });
}
exports.rejectBlueGreenIngress = rejectBlueGreenIngress;
function routeBlueGreenIngress(kubectl, nextLabel, serviceNameMap, ingressEntityList) {
    return __awaiter(this, void 0, void 0, function* () {
        let newObjectsList = [];
        if (!nextLabel) {
            newObjectsList = ingressEntityList.filter((ingress) => isIngressRouted(ingress, serviceNameMap));
        }
        else {
            ingressEntityList.forEach((inputObject) => {
                if (isIngressRouted(inputObject, serviceNameMap)) {
                    const newBlueGreenIngressObject = getUpdatedBlueGreenIngress(inputObject, serviceNameMap, blueGreenHelper_1.GREEN_LABEL_VALUE);
                    newObjectsList.push(newBlueGreenIngressObject);
                }
                else {
                    newObjectsList.push(inputObject);
                }
            });
        }
        core.debug("New objects: " + JSON.stringify(newObjectsList));
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        yield kubectl.apply(manifestFiles);
    });
}
exports.routeBlueGreenIngress = routeBlueGreenIngress;
function validateIngressesState(kubectl, ingressEntityList, serviceNameMap) {
    let areIngressesTargetingNewServices = true;
    ingressEntityList.forEach((inputObject) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (isIngressRouted(inputObject, serviceNameMap)) {
            //querying existing ingress
            const existingIngress = yield blueGreenHelper_1.fetchResource(kubectl, inputObject.kind, inputObject.metadata.name);
            if (!!existingIngress) {
                const currentLabel = (_a = existingIngress === null || existingIngress === void 0 ? void 0 : existingIngress.metadata) === null || _a === void 0 ? void 0 : _a.labels[blueGreenHelper_1.BLUE_GREEN_VERSION_LABEL];
                // if not green label, then wrong configuration
                if (currentLabel != blueGreenHelper_1.GREEN_LABEL_VALUE)
                    areIngressesTargetingNewServices = false;
            }
            else {
                // no ingress at all, so nothing to promote
                areIngressesTargetingNewServices = false;
            }
        }
    }));
    return areIngressesTargetingNewServices;
}
exports.validateIngressesState = validateIngressesState;
function isIngressRouted(ingressObject, serviceNameMap) {
    let isIngressRouted = false;
    // check if ingress targets a service in the given manifests
    JSON.parse(JSON.stringify(ingressObject), (key, value) => {
        if (key === "serviceName" && serviceNameMap.has(value)) {
            isIngressRouted = true;
        }
        return value;
    });
    return isIngressRouted;
}
function getUpdatedBlueGreenIngress(inputObject, serviceNameMap, type) {
    if (!type) {
        return inputObject;
    }
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // add green labels and values
    blueGreenHelper_1.addBlueGreenLabelsAndAnnotations(newObject, type);
    // update ingress labels
    return updateIngressBackend(newObject, serviceNameMap);
}
exports.getUpdatedBlueGreenIngress = getUpdatedBlueGreenIngress;
function updateIngressBackend(inputObject, serviceNameMap) {
    inputObject = JSON.parse(JSON.stringify(inputObject), (key, value) => {
        if (key.toUpperCase() === BACKEND) {
            const { serviceName } = value;
            if (serviceNameMap.has(serviceName)) {
                // update service name with corresponding bluegreen name only if service is provied in given manifests
                value.serviceName = serviceNameMap.get(serviceName);
            }
        }
        return value;
    });
    return inputObject;
}
exports.updateIngressBackend = updateIngressBackend;
