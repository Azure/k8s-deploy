'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchResource = exports.getServiceSelector = exports.getDeploymentMatchLabels = exports.getSpecLabel = exports.getBlueGreenResourceName = exports.addBlueGreenLabelsAndAnnotations = exports.getNewBlueGreenObject = exports.createWorkloadssWithLabel = exports.getManifestObjects = exports.getSuffix = exports.deleteWorkloadsAndServicesWithLabel = exports.cleanUp = exports.deleteWorkloadsWithLabel = exports.STABLE_SUFFIX = exports.BLUE_GREEN_SUFFIX = exports.BLUE_GREEN_VERSION_LABEL = exports.NONE_LABEL_VALUE = exports.BLUE_GREEN_NEW_LABEL_VALUE = void 0;
const core = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const utility_1 = require("../utility");
const constants_1 = require("../../constants");
const string_comparison_1 = require("../string-comparison");
const fileHelper = require("../files-helper");
const helper = require("../resource-object-utility");
exports.BLUE_GREEN_NEW_LABEL_VALUE = 'green';
exports.NONE_LABEL_VALUE = 'None';
exports.BLUE_GREEN_VERSION_LABEL = 'k8s.deploy.color';
exports.BLUE_GREEN_SUFFIX = '-green';
exports.STABLE_SUFFIX = '-stable';
function deleteWorkloadsWithLabel(kubectl, deleteLabel, deploymentEntityList) {
    let delList = [];
    deploymentEntityList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        const kind = inputObject.kind;
        if (deleteLabel === exports.NONE_LABEL_VALUE) {
            // if dellabel is none, deletes stable deployments
            const tempObject = { name: name, kind: kind };
            delList.push(tempObject);
        }
        else {
            // if dellabel is not none, then deletes new green deployments
            const tempObject = { name: name + exports.BLUE_GREEN_SUFFIX, kind: kind };
            delList.push(tempObject);
        }
    });
    // deletes the deployments
    delList.forEach((delObject) => {
        try {
            const result = kubectl.delete([delObject.kind, delObject.name]);
            utility_1.checkForErrors([result]);
        }
        catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    });
}
exports.deleteWorkloadsWithLabel = deleteWorkloadsWithLabel;
function cleanUp(kubectl, deploymentEntityList, serviceEntityList) {
    // checks if services has some stable deployments to target or deletes them too
    let delList = [];
    serviceEntityList.forEach((inputObject) => {
        deploymentEntityList.forEach((depObject) => {
            const kind = depObject.kind;
            const name = depObject.metadata.name;
            if (getServiceSelector(inputObject) && getDeploymentMatchLabels(depObject) && getServiceSelector(inputObject) === getDeploymentMatchLabels(depObject)) {
                const existingDeploy = fetchResource(kubectl, kind, name);
                // checking if it has something to target
                if (!existingDeploy) {
                    const tempObject = { name: inputObject.metadata.name, kind: inputObject.kind };
                    delList.push(tempObject);
                }
            }
        });
    });
    delList.forEach((delObject) => {
        try {
            const result = kubectl.delete([delObject.kind, delObject.name]);
            utility_1.checkForErrors([result]);
        }
        catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    });
}
exports.cleanUp = cleanUp;
function deleteWorkloadsAndServicesWithLabel(kubectl, deleteLabel, deploymentEntityList, serviceEntityList) {
    // need to delete services and deployments
    const deletionEntitiesList = deploymentEntityList.concat(serviceEntityList);
    let deleteList = [];
    deletionEntitiesList.forEach((inputObject) => {
        const name = inputObject.metadata.name;
        const kind = inputObject.kind;
        if (!deleteLabel) {
            // if not dellabel, delete stable objects
            const tempObject = { name: name, kind: kind };
            deleteList.push(tempObject);
        }
        else {
            // else delete green labels
            const tempObject = { name: name + exports.BLUE_GREEN_SUFFIX, kind: kind };
            deleteList.push(tempObject);
        }
    });
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
exports.deleteWorkloadsAndServicesWithLabel = deleteWorkloadsAndServicesWithLabel;
function getSuffix(label) {
    if (label === exports.BLUE_GREEN_NEW_LABEL_VALUE) {
        return exports.BLUE_GREEN_SUFFIX;
    }
    else {
        return '';
    }
}
exports.getSuffix = getSuffix;
// other common functions
function getManifestObjects(filePaths) {
    const deploymentEntityList = [];
    const serviceEntityList = [];
    const ingressEntityList = [];
    const otherEntitiesList = [];
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            if (!!inputObject) {
                const kind = inputObject.kind;
                if (helper.isDeploymentEntity(kind)) {
                    deploymentEntityList.push(inputObject);
                }
                else if (helper.isServiceEntity(kind)) {
                    serviceEntityList.push(inputObject);
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
    let serviceNameMap = new Map();
    // find all services and adding they names with blue green suffix 
    serviceEntityList.forEach(inputObject => {
        const name = inputObject.metadata.name;
        serviceNameMap.set(name, getBlueGreenResourceName(name, exports.BLUE_GREEN_SUFFIX));
    });
    return { serviceEntityList: serviceEntityList, serviceNameMap: serviceNameMap, deploymentEntityList: deploymentEntityList, ingressEntityList: ingressEntityList, otherObjects: otherEntitiesList };
}
exports.getManifestObjects = getManifestObjects;
function createWorkloadssWithLabel(kubectl, depObjectList, nextLabel) {
    const newObjectsList = [];
    depObjectList.forEach((inputObject) => {
        const blueGreenReplicaCount = helper.getReplicaCount(inputObject);
        // creating deployment with label
        const newBlueGreenObject = getNewBlueGreenObject(inputObject, blueGreenReplicaCount, nextLabel);
        core.debug('New blue-green object is: ' + JSON.stringify(newBlueGreenObject));
        newObjectsList.push(newBlueGreenObject);
    });
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    const result = kubectl.apply(manifestFiles);
    return { 'result': result, 'newFilePaths': manifestFiles };
}
exports.createWorkloadssWithLabel = createWorkloadssWithLabel;
function getNewBlueGreenObject(inputObject, replicas, labelValue) {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // Updating name only if label is green label is given
    if (labelValue === exports.BLUE_GREEN_NEW_LABEL_VALUE) {
        newObject.metadata.name = getBlueGreenResourceName(inputObject.metadata.name, exports.BLUE_GREEN_SUFFIX);
    }
    // Adding labels and annotations
    addBlueGreenLabelsAndAnnotations(newObject, labelValue);
    // Updating no. of replicas
    if (isSpecContainsReplicas(newObject.kind)) {
        newObject.spec.replicas = replicas;
    }
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
function isSpecContainsReplicas(kind) {
    return !string_comparison_1.isEqual(kind, constants_1.KubernetesWorkload.pod, string_comparison_1.StringComparer.OrdinalIgnoreCase) &&
        !string_comparison_1.isEqual(kind, constants_1.KubernetesWorkload.daemonSet, string_comparison_1.StringComparer.OrdinalIgnoreCase) &&
        !helper.isServiceEntity(kind);
}
function getBlueGreenResourceName(name, suffix) {
    return name + suffix;
}
exports.getBlueGreenResourceName = getBlueGreenResourceName;
function getSpecLabel(inputObject) {
    if (!!inputObject && inputObject.spec && inputObject.spec.selector && inputObject.spec.selector.matchLabels && inputObject.spec.selector.matchLabels[exports.BLUE_GREEN_VERSION_LABEL]) {
        return inputObject.spec.selector.matchLabels[exports.BLUE_GREEN_VERSION_LABEL];
    }
    return '';
}
exports.getSpecLabel = getSpecLabel;
function getDeploymentMatchLabels(inputObject) {
    if (inputObject.kind.toUpperCase() == 'POD' && !!inputObject && !!inputObject.metadata && !!inputObject.metadata.labels) {
        return JSON.stringify(inputObject.metadata.labels);
    }
    else if (!!inputObject && inputObject.spec && inputObject.spec.selector && inputObject.spec.selector.matchLabels) {
        return JSON.stringify(inputObject.spec.selector.matchLabels);
    }
    return false;
}
exports.getDeploymentMatchLabels = getDeploymentMatchLabels;
function getServiceSelector(inputObject) {
    if (!!inputObject && inputObject.spec && inputObject.spec.selector) {
        return JSON.stringify(inputObject.spec.selector);
    }
    else
        return false;
}
exports.getServiceSelector = getServiceSelector;
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
