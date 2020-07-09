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
exports.updateIngressBackend = exports.getUpdatedBlueGreenIngress = exports.validateIngressState = exports.blueGreenRouteIngress = exports.blueGreenRejectIngress = exports.blueGreenPromoteIngress = exports.deployBlueGreenIngress = exports.isIngressRoute = void 0;
const core = require("@actions/core");
const fileHelper = require("../files-helper");
const TaskInputParameters = require("../../input-parameters");
const blue_green_helper_1 = require("./blue-green-helper");
const blue_green_helper_2 = require("./blue-green-helper");
const INGRESS_ROUTE = 'INGRESS';
function isIngressRoute() {
    const routeMethod = TaskInputParameters.routeMethod;
    return routeMethod && routeMethod.toUpperCase() === INGRESS_ROUTE;
}
exports.isIngressRoute = isIngressRoute;
function deployBlueGreenIngress(kubectl, filePaths) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
    // create deployments with green label value
    const result = blue_green_helper_1.createWorkloadssWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE);
    // create new services and other objects 
    let newObjectsList = [];
    manifestObjects.serviceEntityList.forEach(inputObject => {
        const newBlueGreenObject = blue_green_helper_1.getNewBlueGreenObject(inputObject, 0, blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE);
        ;
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    newObjectsList = newObjectsList.concat(manifestObjects.otherObjects);
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    // return results to check for manifest stability
    return result;
}
exports.deployBlueGreenIngress = deployBlueGreenIngress;
function blueGreenPromoteIngress(kubectl, manifestObjects) {
    return __awaiter(this, void 0, void 0, function* () {
        //checking if anything to promote
        if (!validateIngressState(kubectl, manifestObjects.ingressEntityList, manifestObjects.serviceNameMap)) {
            throw ('NotInPromoteStateIngress');
        }
        // deleting existing stable deploymetns and services
        blue_green_helper_1.deleteWorkloadsAndServicesWithLabel(kubectl, null, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
        // create stable deployments with new configuration
        const result = blue_green_helper_1.createWorkloadssWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.NONE_LABEL_VALUE);
        // create stable services
        const newObjectsList = [];
        manifestObjects.serviceEntityList.forEach((inputObject) => {
            const newBlueGreenObject = blue_green_helper_1.getNewBlueGreenObject(inputObject, 0, blue_green_helper_2.NONE_LABEL_VALUE);
            core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
            newObjectsList.push(newBlueGreenObject);
        });
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        kubectl.apply(manifestFiles);
        // returning deployments to check for rollout stability
        return result;
    });
}
exports.blueGreenPromoteIngress = blueGreenPromoteIngress;
function blueGreenRejectIngress(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
        // routing ingress to stables services
        blueGreenRouteIngress(kubectl, null, manifestObjects.serviceNameMap, manifestObjects.serviceEntityList, manifestObjects.ingressEntityList);
        // deleting green services and deployments
        blue_green_helper_1.deleteWorkloadsAndServicesWithLabel(kubectl, blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
    });
}
exports.blueGreenRejectIngress = blueGreenRejectIngress;
function blueGreenRouteIngress(kubectl, nextLabel, serviceNameMap, serviceEntityList, ingressEntityList) {
    let newObjectsList = [];
    if (!nextLabel) {
        newObjectsList = newObjectsList.concat(ingressEntityList);
    }
    else {
        ingressEntityList.forEach((inputObject) => {
            let isRouted = false;
            // sees if ingress targets a service in the given manifests
            JSON.parse(JSON.stringify(inputObject), (key, value) => {
                if (key === 'serviceName' && serviceNameMap.has(value)) {
                    isRouted = true;
                }
                return value;
            });
            // routing to green objects only if ingress is routed
            if (isRouted) {
                const newBlueGreenIngressObject = getUpdatedBlueGreenIngress(inputObject, serviceNameMap, blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE);
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
exports.blueGreenRouteIngress = blueGreenRouteIngress;
function validateIngressState(kubectl, ingressEntityList, serviceNameMap) {
    let isIngressTargetingNewServices = true;
    ingressEntityList.forEach((inputObject) => {
        let isRouted = false;
        // finding if ingress is targeting a service in given manifests
        JSON.parse(JSON.stringify(inputObject), (key, value) => {
            if (key === 'serviceName' && serviceNameMap.has(value)) {
                isRouted = true;
            }
            return value;
        });
        if (isRouted) {
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
                    isIngressTargetingNewServices = false;
                }
                if (currentLabel != blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE) {
                    // if not green label, then wrong configuration
                    isIngressTargetingNewServices = false;
                }
            }
            else {
                // no ingress at all, so nothing to promote
                isIngressTargetingNewServices = false;
            }
        }
    });
    return isIngressTargetingNewServices;
}
exports.validateIngressState = validateIngressState;
function getUpdatedBlueGreenIngress(inputObject, serviceNameMap, type) {
    if (!type) {
        // returning original with no modifications
        return inputObject;
    }
    const newObject = JSON.parse(JSON.stringify(inputObject));
    //adding green labels and values
    blue_green_helper_1.addBlueGreenLabelsAndAnnotations(newObject, type);
    // Updating ingress labels
    let finalObject = updateIngressBackend(newObject, serviceNameMap);
    return finalObject;
}
exports.getUpdatedBlueGreenIngress = getUpdatedBlueGreenIngress;
function updateIngressBackend(inputObject, serviceNameMap) {
    inputObject = JSON.parse(JSON.stringify(inputObject), (key, value) => {
        if (key.toUpperCase() === 'BACKEND') {
            let serName = value.serviceName;
            if (serviceNameMap.has(serName)) {
                //updating srvice name with corresponging bluegreen name only if service is provied in given manifests
                value.serviceName = serviceNameMap.get(serName);
            }
        }
        return value;
    });
    return inputObject;
}
exports.updateIngressBackend = updateIngressBackend;
