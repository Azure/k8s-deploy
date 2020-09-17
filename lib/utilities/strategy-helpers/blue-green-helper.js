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
exports.fetchResource = exports.isServiceSelectorSubsetOfMatchLabel = exports.getServiceSelector = exports.getDeploymentMatchLabels = exports.getBlueGreenResourceName = exports.addBlueGreenLabelsAndAnnotations = exports.getNewBlueGreenObject = exports.createWorkloadsWithLabel = exports.isServiceRouted = exports.getManifestObjects = exports.getSuffix = exports.deleteObjects = exports.deleteWorkloadsAndServicesWithLabel = exports.deleteWorkloadsWithLabel = exports.routeBlueGreen = exports.isSMIRoute = exports.isIngressRoute = exports.isBlueGreenDeploymentStrategy = exports.STABLE_SUFFIX = exports.GREEN_SUFFIX = exports.BLUE_GREEN_VERSION_LABEL = exports.NONE_LABEL_VALUE = exports.GREEN_LABEL_VALUE = exports.BLUE_GREEN_DEPLOYMENT_STRATEGY = void 0;
const core = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const utility_1 = require("../utility");
const constants_1 = require("../../constants");
const fileHelper = require("../files-helper");
const helper = require("../resource-object-utility");
const TaskInputParameters = require("../../input-parameters");
const service_blue_green_helper_1 = require("./service-blue-green-helper");
const ingress_blue_green_helper_1 = require("./ingress-blue-green-helper");
const smi_blue_green_helper_1 = require("./smi-blue-green-helper");
exports.BLUE_GREEN_DEPLOYMENT_STRATEGY = 'BLUE-GREEN';
exports.GREEN_LABEL_VALUE = 'green';
exports.NONE_LABEL_VALUE = 'None';
exports.BLUE_GREEN_VERSION_LABEL = 'k8s.deploy.color';
exports.GREEN_SUFFIX = '-green';
exports.STABLE_SUFFIX = '-stable';
const INGRESS_ROUTE = 'INGRESS';
const SMI_ROUTE = 'SMI';
function isBlueGreenDeploymentStrategy() {
    const deploymentStrategy = TaskInputParameters.deploymentStrategy;
    return deploymentStrategy && deploymentStrategy.toUpperCase() === exports.BLUE_GREEN_DEPLOYMENT_STRATEGY;
}
exports.isBlueGreenDeploymentStrategy = isBlueGreenDeploymentStrategy;
function isIngressRoute() {
    const routeMethod = TaskInputParameters.routeMethod;
    return routeMethod && routeMethod.toUpperCase() === INGRESS_ROUTE;
}
exports.isIngressRoute = isIngressRoute;
function isSMIRoute() {
    const routeMethod = TaskInputParameters.routeMethod;
    return routeMethod && routeMethod.toUpperCase() === SMI_ROUTE;
}
exports.isSMIRoute = isSMIRoute;
function routeBlueGreen(kubectl, inputManifestFiles) {
    return __awaiter(this, void 0, void 0, function* () {
        // get buffer time
        let bufferTime = parseInt(TaskInputParameters.versionSwitchBuffer);
        //logging start of buffer time
        let dateNow = new Date();
        console.log(`Starting buffer time of ${bufferTime} minute(s) at ${dateNow.toISOString()}`);
        // waiting
        yield utility_1.sleep(bufferTime * 1000 * 60);
        // logging end of buffer time
        dateNow = new Date();
        console.log(`Stopping buffer time of ${bufferTime} minute(s) at ${dateNow.toISOString()}`);
        const manifestObjects = getManifestObjects(inputManifestFiles);
        // routing to new deployments
        if (isIngressRoute()) {
            ingress_blue_green_helper_1.routeBlueGreenIngress(kubectl, exports.GREEN_LABEL_VALUE, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);
        }
        else if (isSMIRoute()) {
            smi_blue_green_helper_1.routeBlueGreenSMI(kubectl, exports.GREEN_LABEL_VALUE, manifestObjects.serviceEntityList);
        }
        else {
            service_blue_green_helper_1.routeBlueGreenService(kubectl, exports.GREEN_LABEL_VALUE, manifestObjects.serviceEntityList);
        }
    });
}
exports.routeBlueGreen = routeBlueGreen;
function deleteWorkloadsWithLabel(kubectl, deleteLabel, deploymentEntityList) {
    let resourcesToDelete = [];
    deploymentEntityList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        const kind = inputObject.kind;
        if (deleteLabel === exports.NONE_LABEL_VALUE) {
            // if dellabel is none, deletes stable deployments
            const resourceToDelete = { name: name, kind: kind };
            resourcesToDelete.push(resourceToDelete);
        }
        else {
            // if dellabel is not none, then deletes new green deployments
            const resourceToDelete = { name: getBlueGreenResourceName(name, exports.GREEN_SUFFIX), kind: kind };
            resourcesToDelete.push(resourceToDelete);
        }
    });
    // deletes the deployments
    deleteObjects(kubectl, resourcesToDelete);
}
exports.deleteWorkloadsWithLabel = deleteWorkloadsWithLabel;
function deleteWorkloadsAndServicesWithLabel(kubectl, deleteLabel, deploymentEntityList, serviceEntityList) {
    // need to delete services and deployments
    const deletionEntitiesList = deploymentEntityList.concat(serviceEntityList);
    let resourcesToDelete = [];
    deletionEntitiesList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        const kind = inputObject.kind;
        if (deleteLabel === exports.NONE_LABEL_VALUE) {
            // if not dellabel, delete stable objects
            const resourceToDelete = { name: name, kind: kind };
            resourcesToDelete.push(resourceToDelete);
        }
        else {
            // else delete green labels
            const resourceToDelete = { name: getBlueGreenResourceName(name, exports.GREEN_SUFFIX), kind: kind };
            resourcesToDelete.push(resourceToDelete);
        }
    });
    deleteObjects(kubectl, resourcesToDelete);
}
exports.deleteWorkloadsAndServicesWithLabel = deleteWorkloadsAndServicesWithLabel;
function deleteObjects(kubectl, deleteList) {
    // delete services and deployments
    deleteList.forEach((delObject) => {
        try {
            const result = kubectl.delete([delObject.kind, delObject.name]);
            utility_1.checkForErrors([result]);
        }
        catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    });
}
exports.deleteObjects = deleteObjects;
function getSuffix(label) {
    if (label === exports.GREEN_LABEL_VALUE) {
        return exports.GREEN_SUFFIX;
    }
    else {
        return '';
    }
}
exports.getSuffix = getSuffix;
// other common functions
function getManifestObjects(filePaths) {
    const deploymentEntityList = [];
    const routedServiceEntityList = [];
    const unroutedServiceEntityList = [];
    const ingressEntityList = [];
    const otherEntitiesList = [];
    let serviceNameMap = new Map();
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            if (!!inputObject) {
                const kind = inputObject.kind;
                const name = inputObject.metadata.name;
                if (helper.isDeploymentEntity(kind)) {
                    deploymentEntityList.push(inputObject);
                }
                else if (helper.isServiceEntity(kind)) {
                    if (isServiceRouted(inputObject, deploymentEntityList)) {
                        routedServiceEntityList.push(inputObject);
                        serviceNameMap.set(name, getBlueGreenResourceName(name, exports.GREEN_SUFFIX));
                    }
                    else {
                        unroutedServiceEntityList.push(inputObject);
                    }
                }
                else if (helper.isIngressEntity(kind)) {
                    ingressEntityList.push(inputObject);
                }
                else {
                    otherEntitiesList.push(inputObject);
                }
            }
        });
    });
    return { serviceEntityList: routedServiceEntityList, serviceNameMap: serviceNameMap, unroutedServiceEntityList: unroutedServiceEntityList, deploymentEntityList: deploymentEntityList, ingressEntityList: ingressEntityList, otherObjects: otherEntitiesList };
}
exports.getManifestObjects = getManifestObjects;
function isServiceRouted(serviceObject, deploymentEntityList) {
    let shouldBeRouted = false;
    const serviceSelector = getServiceSelector(serviceObject);
    if (!!serviceSelector) {
        if (deploymentEntityList.some((depObject) => {
            // finding if there is a deployment in the given manifests the service targets
            const matchLabels = getDeploymentMatchLabels(depObject);
            return (!!matchLabels && isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels));
        })) {
            shouldBeRouted = true;
        }
    }
    return shouldBeRouted;
}
exports.isServiceRouted = isServiceRouted;
function createWorkloadsWithLabel(kubectl, deploymentObjectList, nextLabel) {
    const newObjectsList = [];
    deploymentObjectList.forEach((inputObject) => {
        // creating deployment with label
        const newBlueGreenObject = getNewBlueGreenObject(inputObject, nextLabel);
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    const result = kubectl.apply(manifestFiles);
    return { 'result': result, 'newFilePaths': manifestFiles };
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
    helper.updateObjectLabels(inputObject, newLabels, false);
    helper.updateSelectorLabels(inputObject, newLabels, false);
    // updating spec labels if it is a service
    if (!helper.isServiceEntity(inputObject.kind)) {
        helper.updateSpecLabels(inputObject, newLabels, false);
    }
}
exports.addBlueGreenLabelsAndAnnotations = addBlueGreenLabelsAndAnnotations;
function getBlueGreenResourceName(name, suffix) {
    return `${name}${suffix}`;
}
exports.getBlueGreenResourceName = getBlueGreenResourceName;
function getDeploymentMatchLabels(deploymentObject) {
    if (!!deploymentObject && deploymentObject.kind.toUpperCase() == constants_1.KubernetesWorkload.pod.toUpperCase() && !!deploymentObject.metadata && !!deploymentObject.metadata.labels) {
        return deploymentObject.metadata.labels;
    }
    else if (!!deploymentObject && deploymentObject.spec && deploymentObject.spec.selector && deploymentObject.spec.selector.matchLabels) {
        return deploymentObject.spec.selector.matchLabels;
    }
    return null;
}
exports.getDeploymentMatchLabels = getDeploymentMatchLabels;
function getServiceSelector(serviceObject) {
    if (!!serviceObject && serviceObject.spec && serviceObject.spec.selector) {
        return serviceObject.spec.selector;
    }
    else
        return null;
}
exports.getServiceSelector = getServiceSelector;
function isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels) {
    let serviceSelectorMap = new Map();
    let matchLabelsMap = new Map();
    JSON.parse(JSON.stringify(serviceSelector), (key, value) => {
        serviceSelectorMap.set(key, value);
    });
    JSON.parse(JSON.stringify(matchLabels), (key, value) => {
        matchLabelsMap.set(key, value);
    });
    let isMatch = true;
    serviceSelectorMap.forEach((value, key) => {
        if (!!key && (!matchLabelsMap.has(key) || matchLabelsMap.get(key)) != value) {
            isMatch = false;
        }
    });
    return isMatch;
}
exports.isServiceSelectorSubsetOfMatchLabel = isServiceSelectorSubsetOfMatchLabel;
function fetchResource(kubectl, kind, name) {
    const result = kubectl.getResource(kind, name);
    if (result == null || !!result.stderr) {
        return null;
    }
    if (!!result.stdout) {
        const resource = JSON.parse(result.stdout);
        try {
            UnsetsClusterSpecficDetails(resource);
            return resource;
        }
        catch (ex) {
            core.debug('Exception occurred while Parsing ' + resource + ' in Json object');
            core.debug(`Exception:${ex}`);
        }
    }
    return null;
}
exports.fetchResource = fetchResource;
function UnsetsClusterSpecficDetails(resource) {
    if (resource == null) {
        return;
    }
    // Unsets the cluster specific details in the object
    if (!!resource) {
        const metadata = resource.metadata;
        const status = resource.status;
        if (!!metadata) {
            const newMetadata = {
                'annotations': metadata.annotations,
                'labels': metadata.labels,
                'name': metadata.name
            };
            resource.metadata = newMetadata;
        }
        if (!!status) {
            resource.status = {};
        }
    }
}
