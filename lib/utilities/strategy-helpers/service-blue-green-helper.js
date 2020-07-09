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
exports.getServiceSpecLabel = exports.validateServiceState = exports.blueGreenRouteService = exports.blueGreenReject = exports.blueGreenPromote = exports.deployBlueGreen = exports.isBlueGreenDeploymentStrategy = exports.BLUE_GREEN_DEPLOYMENT_STRATEGY = void 0;
const fileHelper = require("../files-helper");
const TaskInputParameters = require("../../input-parameters");
const blue_green_helper_1 = require("./blue-green-helper");
const blue_green_helper_2 = require("./blue-green-helper");
exports.BLUE_GREEN_DEPLOYMENT_STRATEGY = 'BLUE-GREEN';
function isBlueGreenDeploymentStrategy() {
    const deploymentStrategy = TaskInputParameters.deploymentStrategy;
    return deploymentStrategy && deploymentStrategy.toUpperCase() === exports.BLUE_GREEN_DEPLOYMENT_STRATEGY;
}
exports.isBlueGreenDeploymentStrategy = isBlueGreenDeploymentStrategy;
function deployBlueGreen(kubectl, filePaths) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
    // create deployments with green label value
    const result = blue_green_helper_1.createWorkloadssWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE);
    // create other non deployment and non service entities
    const newObjectsList = manifestObjects.otherObjects.concat(manifestObjects.ingressEntityList);
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    // returning deployment details to check for rollout stability
    return result;
}
exports.deployBlueGreen = deployBlueGreen;
function blueGreenPromote(kubectl, manifestObjects) {
    return __awaiter(this, void 0, void 0, function* () {
        // checking if services are in the right state ie. targeting green deployments
        if (!validateServiceState(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList)) {
            throw ('NotInPromoteState');
        }
        // deleting previous stable deployments
        blue_green_helper_1.deleteWorkloadsWithLabel(kubectl, blue_green_helper_2.NONE_LABEL_VALUE, manifestObjects.deploymentEntityList);
        // creating stable deployments with new configurations
        const result = blue_green_helper_1.createWorkloadssWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.NONE_LABEL_VALUE);
        // returning deployment details to check for rollout stability
        return result;
    });
}
exports.blueGreenPromote = blueGreenPromote;
function blueGreenReject(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
        // routing to stable objects
        blueGreenRouteService(kubectl, blue_green_helper_2.NONE_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
        // seeing if we should even delete the service
        blue_green_helper_1.cleanUp(kubectl, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
        // deleting the new deployments with green suffix
        blue_green_helper_1.deleteWorkloadsWithLabel(kubectl, blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.deploymentEntityList);
    });
}
exports.blueGreenReject = blueGreenReject;
function blueGreenRouteService(kubectl, nextLabel, deploymentEntityList, serviceEntityList) {
    const newObjectsList = [];
    serviceEntityList.forEach((inputObject) => {
        let isRouted = false;
        deploymentEntityList.forEach((depObject) => {
            // finding if there is a deployment in the given manifests the service targets
            if (blue_green_helper_1.getServiceSelector(inputObject) && blue_green_helper_1.getDeploymentMatchLabels(depObject) && blue_green_helper_1.getServiceSelector(inputObject) === blue_green_helper_1.getDeploymentMatchLabels(depObject)) {
                isRouted = true;
                // decided that this service needs to be routed
                // point to the given nextlabel
                const newBlueGreenServiceObject = getUpdatedBlueGreenService(inputObject, nextLabel);
                newObjectsList.push(newBlueGreenServiceObject);
            }
        });
        if (!isRouted) {
            // if service is not routed, just push the original service
            newObjectsList.push(inputObject);
        }
    });
    // configures the services
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
}
exports.blueGreenRouteService = blueGreenRouteService;
function getUpdatedBlueGreenService(inputObject, labelValue) {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // Adding labels and annotations.
    blue_green_helper_1.addBlueGreenLabelsAndAnnotations(newObject, labelValue);
    return newObject;
}
function validateServiceState(kubectl, deploymentEntityList, serviceEntityList) {
    let isServiceTargetingNewWorkloads = true;
    serviceEntityList.forEach((inputObject) => {
        deploymentEntityList.forEach((depObject) => {
            // finding out if the service is pointing to a deployment in this manifest
            if (blue_green_helper_1.getServiceSelector(inputObject) && blue_green_helper_1.getDeploymentMatchLabels(depObject) && blue_green_helper_1.getServiceSelector(inputObject) === blue_green_helper_1.getDeploymentMatchLabels(depObject)) {
                // finding the existing routed service
                let existingService = blue_green_helper_1.fetchResource(kubectl, inputObject.kind, inputObject.metadata.name);
                if (!!existingService) {
                    let currentLabel = getServiceSpecLabel(existingService);
                    if (currentLabel != blue_green_helper_2.BLUE_GREEN_NEW_LABEL_VALUE) {
                        // service should be targeting deployments with green label
                        isServiceTargetingNewWorkloads = false;
                    }
                }
                else {
                    // service targeting deployment doesn't exist
                    isServiceTargetingNewWorkloads = false;
                }
            }
        });
    });
    return isServiceTargetingNewWorkloads;
}
exports.validateServiceState = validateServiceState;
function getServiceSpecLabel(inputObject) {
    if (!!inputObject && inputObject.spec && inputObject.spec.selector && inputObject.spec.selector[blue_green_helper_2.BLUE_GREEN_VERSION_LABEL]) {
        return inputObject.spec.selector[blue_green_helper_2.BLUE_GREEN_VERSION_LABEL];
    }
    return '';
}
exports.getServiceSpecLabel = getServiceSpecLabel;
