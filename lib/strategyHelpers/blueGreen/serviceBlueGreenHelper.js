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
exports.getServiceSpecLabel = exports.validateServicesState = exports.routeBlueGreenService = exports.rejectBlueGreenService = exports.promoteBlueGreenService = exports.deployBlueGreenService = void 0;
const fileHelper = require("../../utilities/fileUtils");
const blueGreenHelper_1 = require("./blueGreenHelper");
function deployBlueGreenService(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        const manifestObjects = blueGreenHelper_1.getManifestObjects(filePaths);
        // create deployments with green label value
        const result = yield blueGreenHelper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blueGreenHelper_1.GREEN_LABEL_VALUE);
        // create other non deployment and non service entities
        const newObjectsList = manifestObjects.otherObjects
            .concat(manifestObjects.ingressEntityList)
            .concat(manifestObjects.unroutedServiceEntityList);
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        if (manifestFiles.length > 0)
            yield kubectl.apply(manifestFiles);
        // returning deployment details to check for rollout stability
        return result;
    });
}
exports.deployBlueGreenService = deployBlueGreenService;
function promoteBlueGreenService(kubectl, manifestObjects) {
    return __awaiter(this, void 0, void 0, function* () {
        // checking if services are in the right state ie. targeting green deployments
        if (!(yield validateServicesState(kubectl, manifestObjects.serviceEntityList))) {
            throw "Not inP promote state";
        }
        // creating stable deployments with new configurations
        return yield blueGreenHelper_1.createWorkloadsWithLabel(kubectl, manifestObjects.deploymentEntityList, blueGreenHelper_1.NONE_LABEL_VALUE);
    });
}
exports.promoteBlueGreenService = promoteBlueGreenService;
function rejectBlueGreenService(kubectl, filePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        // get all kubernetes objects defined in manifest files
        const manifestObjects = blueGreenHelper_1.getManifestObjects(filePaths);
        // route to stable objects
        yield routeBlueGreenService(kubectl, blueGreenHelper_1.NONE_LABEL_VALUE, manifestObjects.serviceEntityList);
        // delete new deployments with green suffix
        yield blueGreenHelper_1.deleteWorkloadsWithLabel(kubectl, blueGreenHelper_1.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
    });
}
exports.rejectBlueGreenService = rejectBlueGreenService;
function routeBlueGreenService(kubectl, nextLabel, serviceEntityList) {
    return __awaiter(this, void 0, void 0, function* () {
        const newObjectsList = [];
        serviceEntityList.forEach((serviceObject) => {
            const newBlueGreenServiceObject = getUpdatedBlueGreenService(serviceObject, nextLabel);
            newObjectsList.push(newBlueGreenServiceObject);
        });
        // configures the services
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        yield kubectl.apply(manifestFiles);
    });
}
exports.routeBlueGreenService = routeBlueGreenService;
// add green labels to configure existing service
function getUpdatedBlueGreenService(inputObject, labelValue) {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // Adding labels and annotations.
    blueGreenHelper_1.addBlueGreenLabelsAndAnnotations(newObject, labelValue);
    return newObject;
}
function validateServicesState(kubectl, serviceEntityList) {
    return __awaiter(this, void 0, void 0, function* () {
        let areServicesGreen = true;
        for (const serviceObject of serviceEntityList) {
            // finding the existing routed service
            const existingService = yield blueGreenHelper_1.fetchResource(kubectl, serviceObject.kind, serviceObject.metadata.name);
            if (!!existingService) {
                const currentLabel = getServiceSpecLabel(existingService);
                if (currentLabel != blueGreenHelper_1.GREEN_LABEL_VALUE) {
                    // service should be targeting deployments with green label
                    areServicesGreen = false;
                }
            }
            else {
                // service targeting deployment doesn't exist
                areServicesGreen = false;
            }
        }
        return areServicesGreen;
    });
}
exports.validateServicesState = validateServicesState;
function getServiceSpecLabel(inputObject) {
    var _a;
    if ((_a = inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec) === null || _a === void 0 ? void 0 : _a.selector[blueGreenHelper_1.BLUE_GREEN_VERSION_LABEL]) {
        return inputObject.spec.selector[blueGreenHelper_1.BLUE_GREEN_VERSION_LABEL];
    }
    return "";
}
exports.getServiceSpecLabel = getServiceSpecLabel;
