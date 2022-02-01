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
exports.fetchResource = exports.isServiceSelectorSubsetOfMatchLabel = exports.getServiceSelector = exports.getDeploymentMatchLabels = exports.getBlueGreenResourceName = exports.addBlueGreenLabelsAndAnnotations = exports.getNewBlueGreenObject = exports.createWorkloadsWithLabel = exports.isServiceRouted = exports.getManifestObjects = exports.deleteObjects = exports.deleteWorkloadsAndServicesWithLabel = exports.deleteWorkloadsWithLabel = exports.routeBlueGreen = exports.STABLE_SUFFIX = exports.GREEN_SUFFIX = exports.BLUE_GREEN_VERSION_LABEL = exports.NONE_LABEL_VALUE = exports.GREEN_LABEL_VALUE = void 0;
const core = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const kubernetesTypes_1 = require("../../types/kubernetesTypes");
const fileHelper = require("../../utilities/fileUtils");
const serviceBlueGreenHelper_1 = require("./serviceBlueGreenHelper");
const ingressBlueGreenHelper_1 = require("./ingressBlueGreenHelper");
const smiBlueGreenHelper_1 = require("./smiBlueGreenHelper");
const manifestUpdateUtils_1 = require("../../utilities/manifestUpdateUtils");
const manifestSpecLabelUtils_1 = require("../../utilities/manifestSpecLabelUtils");
const kubectlUtils_1 = require("../../utilities/kubectlUtils");
const timeUtils_1 = require("../../utilities/timeUtils");
const routeStrategy_1 = require("../../types/routeStrategy");
exports.GREEN_LABEL_VALUE = "green";
exports.NONE_LABEL_VALUE = "None";
exports.BLUE_GREEN_VERSION_LABEL = "k8s.deploy.color";
exports.GREEN_SUFFIX = "-green";
exports.STABLE_SUFFIX = "-stable";
function routeBlueGreen(kubectl, inputManifestFiles, routeStrategy) {
    return __awaiter(this, void 0, void 0, function* () {
        // sleep for buffer time
        const bufferTime = parseInt(core.getInput("version-switch-buffer") || "0");
        if (bufferTime < 0 || bufferTime > 300)
            throw Error("Version switch buffer must be between 0 and 300 (inclusive)");
        const startSleepDate = new Date();
        core.info(`Starting buffer time of ${bufferTime} minute(s) at ${startSleepDate.toISOString()}`);
        yield timeUtils_1.sleep(bufferTime * 1000 * 60);
        const endSleepDate = new Date();
        core.info(`Stopping buffer time of ${bufferTime} minute(s) at ${endSleepDate.toISOString()}`);
        const manifestObjects = getManifestObjects(inputManifestFiles);
        core.debug("Manifest objects: " + JSON.stringify(manifestObjects));
        // route to new deployments
        if (routeStrategy == routeStrategy_1.RouteStrategy.INGRESS) {
            yield ingressBlueGreenHelper_1.routeBlueGreenIngress(kubectl, exports.GREEN_LABEL_VALUE, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);
        }
        else if (routeStrategy == routeStrategy_1.RouteStrategy.SMI) {
            yield smiBlueGreenHelper_1.routeBlueGreenSMI(kubectl, exports.GREEN_LABEL_VALUE, manifestObjects.serviceEntityList);
        }
        else {
            yield serviceBlueGreenHelper_1.routeBlueGreenService(kubectl, exports.GREEN_LABEL_VALUE, manifestObjects.serviceEntityList);
        }
    });
}
exports.routeBlueGreen = routeBlueGreen;
function deleteWorkloadsWithLabel(kubectl, deleteLabel, deploymentEntityList) {
    return __awaiter(this, void 0, void 0, function* () {
        const resourcesToDelete = [];
        deploymentEntityList.forEach((inputObject) => {
            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (deleteLabel === exports.NONE_LABEL_VALUE) {
                // delete stable deployments
                const resourceToDelete = { name, kind };
                resourcesToDelete.push(resourceToDelete);
            }
            else {
                // delete new green deployments
                const resourceToDelete = {
                    name: getBlueGreenResourceName(name, exports.GREEN_SUFFIX),
                    kind: kind,
                };
                resourcesToDelete.push(resourceToDelete);
            }
        });
        yield deleteObjects(kubectl, resourcesToDelete);
    });
}
exports.deleteWorkloadsWithLabel = deleteWorkloadsWithLabel;
function deleteWorkloadsAndServicesWithLabel(kubectl, deleteLabel, deploymentEntityList, serviceEntityList) {
    return __awaiter(this, void 0, void 0, function* () {
        // need to delete services and deployments
        const deletionEntitiesList = deploymentEntityList.concat(serviceEntityList);
        const resourcesToDelete = [];
        deletionEntitiesList.forEach((inputObject) => {
            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (deleteLabel === exports.NONE_LABEL_VALUE) {
                // delete stable objects
                const resourceToDelete = { name, kind };
                resourcesToDelete.push(resourceToDelete);
            }
            else {
                // delete green labels
                const resourceToDelete = {
                    name: getBlueGreenResourceName(name, exports.GREEN_SUFFIX),
                    kind: kind,
                };
                resourcesToDelete.push(resourceToDelete);
            }
        });
        yield deleteObjects(kubectl, resourcesToDelete);
    });
}
exports.deleteWorkloadsAndServicesWithLabel = deleteWorkloadsAndServicesWithLabel;
function deleteObjects(kubectl, deleteList) {
    return __awaiter(this, void 0, void 0, function* () {
        // delete services and deployments
        for (const delObject of deleteList) {
            try {
                const result = yield kubectl.delete([delObject.kind, delObject.name]);
                kubectlUtils_1.checkForErrors([result]);
            }
            catch (ex) {
                // Ignore failures of delete if it doesn't exist
            }
        }
    });
}
exports.deleteObjects = deleteObjects;
// other common functions
function getManifestObjects(filePaths) {
    const deploymentEntityList = [];
    const routedServiceEntityList = [];
    const unroutedServiceEntityList = [];
    const ingressEntityList = [];
    const otherEntitiesList = [];
    const serviceNameMap = new Map();
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath).toString();
        yaml.safeLoadAll(fileContents, (inputObject) => {
            if (!!inputObject) {
                const kind = inputObject.kind;
                const name = inputObject.metadata.name;
                if (kubernetesTypes_1.isDeploymentEntity(kind)) {
                    deploymentEntityList.push(inputObject);
                }
                else if (kubernetesTypes_1.isServiceEntity(kind)) {
                    if (isServiceRouted(inputObject, deploymentEntityList)) {
                        routedServiceEntityList.push(inputObject);
                        serviceNameMap.set(name, getBlueGreenResourceName(name, exports.GREEN_SUFFIX));
                    }
                    else {
                        unroutedServiceEntityList.push(inputObject);
                    }
                }
                else if (kubernetesTypes_1.isIngressEntity(kind)) {
                    ingressEntityList.push(inputObject);
                }
                else {
                    otherEntitiesList.push(inputObject);
                }
            }
        });
    });
    return {
        serviceEntityList: routedServiceEntityList,
        serviceNameMap: serviceNameMap,
        unroutedServiceEntityList: unroutedServiceEntityList,
        deploymentEntityList: deploymentEntityList,
        ingressEntityList: ingressEntityList,
        otherObjects: otherEntitiesList,
    };
}
exports.getManifestObjects = getManifestObjects;
function isServiceRouted(serviceObject, deploymentEntityList) {
    let shouldBeRouted = false;
    const serviceSelector = getServiceSelector(serviceObject);
    if (serviceSelector) {
        if (deploymentEntityList.some((depObject) => {
            // finding if there is a deployment in the given manifests the service targets
            const matchLabels = getDeploymentMatchLabels(depObject);
            return (matchLabels &&
                isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels));
        })) {
            shouldBeRouted = true;
        }
    }
    return shouldBeRouted;
}
exports.isServiceRouted = isServiceRouted;
function createWorkloadsWithLabel(kubectl, deploymentObjectList, nextLabel) {
    return __awaiter(this, void 0, void 0, function* () {
        const newObjectsList = [];
        deploymentObjectList.forEach((inputObject) => {
            // creating deployment with label
            const newBlueGreenObject = getNewBlueGreenObject(inputObject, nextLabel);
            core.debug("New blue-green object is: " + JSON.stringify(newBlueGreenObject));
            newObjectsList.push(newBlueGreenObject);
        });
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        const result = yield kubectl.apply(manifestFiles);
        return { result: result, newFilePaths: manifestFiles };
    });
}
exports.createWorkloadsWithLabel = createWorkloadsWithLabel;
function getNewBlueGreenObject(inputObject, labelValue) {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // Updating name only if label is green label is given
    if (labelValue === exports.GREEN_LABEL_VALUE) {
        newObject.metadata.name = getBlueGreenResourceName(inputObject.metadata.name, exports.GREEN_SUFFIX);
    }
    // Adding labels and annotations
    addBlueGreenLabelsAndAnnotations(newObject, labelValue);
    return newObject;
}
exports.getNewBlueGreenObject = getNewBlueGreenObject;
function addBlueGreenLabelsAndAnnotations(inputObject, labelValue) {
    //creating the k8s.deploy.color label
    const newLabels = new Map();
    newLabels[exports.BLUE_GREEN_VERSION_LABEL] = labelValue;
    // updating object labels and selector labels
    manifestUpdateUtils_1.updateObjectLabels(inputObject, newLabels, false);
    manifestUpdateUtils_1.updateSelectorLabels(inputObject, newLabels, false);
    // updating spec labels if it is a service
    if (!kubernetesTypes_1.isServiceEntity(inputObject.kind)) {
        manifestSpecLabelUtils_1.updateSpecLabels(inputObject, newLabels, false);
    }
}
exports.addBlueGreenLabelsAndAnnotations = addBlueGreenLabelsAndAnnotations;
function getBlueGreenResourceName(name, suffix) {
    return `${name}${suffix}`;
}
exports.getBlueGreenResourceName = getBlueGreenResourceName;
function getDeploymentMatchLabels(deploymentObject) {
    var _a, _b, _c, _d;
    if (((_a = deploymentObject === null || deploymentObject === void 0 ? void 0 : deploymentObject.kind) === null || _a === void 0 ? void 0 : _a.toUpperCase()) ==
        kubernetesTypes_1.KubernetesWorkload.POD.toUpperCase() && ((_b = deploymentObject === null || deploymentObject === void 0 ? void 0 : deploymentObject.metadata) === null || _b === void 0 ? void 0 : _b.labels)) {
        return deploymentObject.metadata.labels;
    }
    else if ((_d = (_c = deploymentObject === null || deploymentObject === void 0 ? void 0 : deploymentObject.spec) === null || _c === void 0 ? void 0 : _c.selector) === null || _d === void 0 ? void 0 : _d.matchLabels) {
        return deploymentObject.spec.selector.matchLabels;
    }
}
exports.getDeploymentMatchLabels = getDeploymentMatchLabels;
function getServiceSelector(serviceObject) {
    var _a;
    if ((_a = serviceObject === null || serviceObject === void 0 ? void 0 : serviceObject.spec) === null || _a === void 0 ? void 0 : _a.selector) {
        return serviceObject.spec.selector;
    }
}
exports.getServiceSelector = getServiceSelector;
function isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels) {
    const serviceSelectorMap = new Map();
    const matchLabelsMap = new Map();
    JSON.parse(JSON.stringify(serviceSelector), (key, value) => {
        serviceSelectorMap.set(key, value);
    });
    JSON.parse(JSON.stringify(matchLabels), (key, value) => {
        matchLabelsMap.set(key, value);
    });
    let isMatch = true;
    serviceSelectorMap.forEach((value, key) => {
        if (!!key && (!matchLabelsMap.has(key) || matchLabelsMap.get(key)) != value)
            isMatch = false;
    });
    return isMatch;
}
exports.isServiceSelectorSubsetOfMatchLabel = isServiceSelectorSubsetOfMatchLabel;
function fetchResource(kubectl, kind, name) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield kubectl.getResource(kind, name);
        if (result == null || !!result.stderr) {
            return null;
        }
        if (!!result.stdout) {
            const resource = JSON.parse(result.stdout);
            try {
                manifestUpdateUtils_1.UnsetClusterSpecificDetails(resource);
                return resource;
            }
            catch (ex) {
                core.debug(`Exception occurred while Parsing ${resource} in Json object: ${ex}`);
            }
        }
    });
}
exports.fetchResource = fetchResource;
