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
const fileHelper = require("../files-helper");
const blue_green_helper_1 = require("./blue-green-helper");
const blue_green_helper_2 = require("./blue-green-helper");
function deployBlueGreenService(kubectl, filePaths) {
    // get all kubernetes objects defined in manifest files
    const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
    // create deployments with green label value
    const result = blue_green_helper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.GREEN_LABEL_VALUE);
    // create other non deployment and non service entities
    const newObjectsList = manifestObjects.otherObjects.concat(manifestObjects.ingressEntityList).concat(manifestObjects.unroutedServiceEntityList);
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
    // returning deployment details to check for rollout stability
    return result;
}
exports.deployBlueGreenService = deployBlueGreenService;
function promoteBlueGreenService(kubectl, manifestObjects) {
    return __awaiter(this, void 0, void 0, function* () {
        // checking if services are in the right state ie. targeting green deployments
        if (!validateServicesState(kubectl, manifestObjects.serviceEntityList)) {
            throw ('NotInPromoteState');
        }
        // creating stable deployments with new configurations
        const result = blue_green_helper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blue_green_helper_2.NONE_LABEL_VALUE);
        // returning deployment details to check for rollout stability
        return result;
    });
}
exports.promoteBlueGreenService = promoteBlueGreenService;
function rejectBlueGreenService(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blue_green_helper_1.getManifestObjects(filePaths);
        // routing to stable objects
        routeBlueGreenService(kubectl, blue_green_helper_2.NONE_LABEL_VALUE, manifestObjects.serviceEntityList);
        // deleting the new deployments with green suffix
        blue_green_helper_1.deleteWorkloadsWithLabel(kubectl, blue_green_helper_2.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
    });
}
exports.rejectBlueGreenService = rejectBlueGreenService;
function routeBlueGreenService(kubectl, nextLabel, serviceEntityList) {
    const newObjectsList = [];
    serviceEntityList.forEach((serviceObject) => {
        const newBlueGreenServiceObject = getUpdatedBlueGreenService(serviceObject, nextLabel);
        newObjectsList.push(newBlueGreenServiceObject);
    });
    // configures the services
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    kubectl.apply(manifestFiles);
}
exports.routeBlueGreenService = routeBlueGreenService;
// adding green labels to configure existing service
function getUpdatedBlueGreenService(inputObject, labelValue) {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // Adding labels and annotations.
    blue_green_helper_1.addBlueGreenLabelsAndAnnotations(newObject, labelValue);
    return newObject;
}
function validateServicesState(kubectl, serviceEntityList) {
    let areServicesGreen = true;
    serviceEntityList.forEach((serviceObject) => {
        // finding the existing routed service
        const existingService = blue_green_helper_1.fetchResource(kubectl, serviceObject.kind, serviceObject.metadata.name);
        if (!!existingService) {
            let currentLabel = getServiceSpecLabel(existingService);
            if (currentLabel != blue_green_helper_2.GREEN_LABEL_VALUE) {
                // service should be targeting deployments with green label
                areServicesGreen = false;
            }
        }
        else {
            // service targeting deployment doesn't exist
            areServicesGreen = false;
        }
    });
    return areServicesGreen;
}
exports.validateServicesState = validateServicesState;
function getServiceSpecLabel(inputObject) {
    if (!!inputObject && inputObject.spec && inputObject.spec.selector && inputObject.spec.selector[blue_green_helper_2.BLUE_GREEN_VERSION_LABEL]) {
        return inputObject.spec.selector[blue_green_helper_2.BLUE_GREEN_VERSION_LABEL];
    }
    return '';
}
exports.getServiceSpecLabel = getServiceSpecLabel;
