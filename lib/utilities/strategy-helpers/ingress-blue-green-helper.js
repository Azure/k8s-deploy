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
exports.updateIngressBackend = exports.getUpdatedBlueGreenIngress = exports.validateIngressesState = exports.routeBlueGreenIngress = exports.rejectBlueGreenIngress = exports.promoteBlueGreenIngress = exports.deployBlueGreenIngress = void 0;
const core = require("@actions/core");
const fileHelper = require("../files-helper");
const blue_green_helper_1 = require("./blue-green-helper");
const blue_green_helper_2 = require("./blue-green-helper");
const BACKEND = 'BACKEND';
function deployBlueGreenIngress(kubectl, filePaths) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
    // create deployments with green label value
    const result = blue_green_helper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.GREEN_LABEL_VALUE);
    // create new services and other objects 
    let newObjectsList = [];
    manifestObjects.serviceEntityList.forEach(inputObject => {
        const newBlueGreenObject = blue_green_helper_1.getNewBlueGreenObject(inputObject, blue_green_helper_2.GREEN_LABEL_VALUE);
        ;
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    newObjectsList = newObjectsList.concat(manifestObjects.otherObjects).concat(manifestObjects.unroutedServiceEntityList);
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    // return results to check for manifest stability
    return result;
}
exports.deployBlueGreenIngress = deployBlueGreenIngress;
function promoteBlueGreenIngress(kubectl, manifestObjects) {
    return __awaiter(this, void 0, void 0, function* () {
        //checking if anything to promote
        if (!validateIngressesState(kubectl, manifestObjects.ingressEntityList, manifestObjects.serviceNameMap)) {
            throw ('NotInPromoteStateIngress');
        }
        // create stable deployments with new configuration
        const result = blue_green_helper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.NONE_LABEL_VALUE);
        // create stable services with new configuration
        const newObjectsList = [];
        manifestObjects.serviceEntityList.forEach((inputObject) => {
            const newBlueGreenObject = blue_green_helper_1.getNewBlueGreenObject(inputObject, blue_green_helper_2.NONE_LABEL_VALUE);
            core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
            newObjectsList.push(newBlueGreenObject);
        });
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        kubectl.apply(manifestFiles);
        // returning deployments to check for rollout stability
        return result;
    });
}
exports.promoteBlueGreenIngress = promoteBlueGreenIngress;
function rejectBlueGreenIngress(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
        // routing ingress to stables services
        routeBlueGreenIngress(kubectl, null, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);
        // deleting green services and deployments
        blue_green_helper_1.deleteWorkloadsAndServicesWithLabel(kubectl, blue_green_helper_2.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
    });
}
exports.rejectBlueGreenIngress = rejectBlueGreenIngress;
function routeBlueGreenIngress(kubectl, nextLabel, serviceNameMap, ingressEntityList) {
    let newObjectsList = [];
    if (!nextLabel) {
        newObjectsList = ingressEntityList.filter(ingress => isIngressRouted(ingress, serviceNameMap));
    }
    else {
        ingressEntityList.forEach((inputObject) => {
            if (isIngressRouted(inputObject, serviceNameMap)) {
                const newBlueGreenIngressObject = getUpdatedBlueGreenIngress(inputObject, serviceNameMap, blue_green_helper_2.GREEN_LABEL_VALUE);
                newObjectsList.push(newBlueGreenIngressObject);
            }
            else {
                newObjectsList.push(inputObject);
            }
        });
    }
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
}
exports.routeBlueGreenIngress = routeBlueGreenIngress;
function validateIngressesState(kubectl, ingressEntityList, serviceNameMap) {
    let areIngressesTargetingNewServices = true;
    ingressEntityList.forEach((inputObject) => {
        if (isIngressRouted(inputObject, serviceNameMap)) {
            //querying existing ingress
            let existingIngress = blue_green_helper_1.fetchResource(kubectl, inputObject.kind, inputObject.metadata.name);
            if (!!existingIngress) {
                let currentLabel;
                // checking its label
                try {
                    currentLabel = existingIngress.metadata.labels[blue_green_helper_2.BLUE_GREEN_VERSION_LABEL];
                }
                catch (_a) {
                    // if no label exists, then not an ingress targeting green deployments
                    areIngressesTargetingNewServices = false;
                }
                if (currentLabel != blue_green_helper_2.GREEN_LABEL_VALUE) {
                    // if not green label, then wrong configuration
                    areIngressesTargetingNewServices = false;
                }
            }
            else {
                // no ingress at all, so nothing to promote
                areIngressesTargetingNewServices = false;
            }
        }
    });
    return areIngressesTargetingNewServices;
}
exports.validateIngressesState = validateIngressesState;
function isIngressRouted(ingressObject, serviceNameMap) {
    let isIngressRouted = false;
    // sees if ingress targets a service in the given manifests
    JSON.parse(JSON.stringify(ingressObject), (key, value) => {
        if (key === 'serviceName' && serviceNameMap.has(value)) {
            isIngressRouted = true;
        }
        return value;
    });
    return isIngressRouted;
}
function getUpdatedBlueGreenIngress(inputObject, serviceNameMap, type) {
    if (!type) {
        // returning original with no modifications
        return inputObject;
    }
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // adding green labels and values
    blue_green_helper_1.addBlueGreenLabelsAndAnnotations(newObject, type);
    // Updating ingress labels
    let finalObject = updateIngressBackend(newObject, serviceNameMap);
    return finalObject;
}
exports.getUpdatedBlueGreenIngress = getUpdatedBlueGreenIngress;
function updateIngressBackend(inputObject, serviceNameMap) {
    inputObject = JSON.parse(JSON.stringify(inputObject), (key, value) => {
        if (key.toUpperCase() === BACKEND) {
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
exports.updateIngressBackend = updateIngressBackend;
