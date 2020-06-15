'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStableResourceName = exports.getBaselineResourceName = exports.getCanaryResourceName = exports.isSMICanaryStrategy = exports.isCanaryDeploymentStrategy = exports.fetchResource = exports.fetchCanaryResource = exports.getNewCanaryResource = exports.getNewBaselineResource = exports.getStableResource = exports.isResourceMarkedAsStable = exports.markResourceAsStable = exports.deleteCanaryDeployment = exports.STABLE_LABEL_VALUE = exports.STABLE_SUFFIX = exports.CANARY_LABEL_VALUE = exports.BASELINE_LABEL_VALUE = exports.CANARY_VERSION_LABEL = exports.TRAFFIC_SPLIT_STRATEGY = exports.CANARY_DEPLOYMENT_STRATEGY = void 0;
const fs = require("fs");
const yaml = require("js-yaml");
const core = require("@actions/core");
const TaskInputParameters = require("../../input-parameters");
const helper = require("../resource-object-utility");
const constants_1 = require("../../constants");
const string_comparison_1 = require("../string-comparison");
const utility_1 = require("../utility");
const utils = require("../manifest-utilities");
exports.CANARY_DEPLOYMENT_STRATEGY = 'CANARY';
exports.TRAFFIC_SPLIT_STRATEGY = 'SMI';
exports.CANARY_VERSION_LABEL = 'workflow/version';
const BASELINE_SUFFIX = '-baseline';
exports.BASELINE_LABEL_VALUE = 'baseline';
const CANARY_SUFFIX = '-canary';
exports.CANARY_LABEL_VALUE = 'canary';
exports.STABLE_SUFFIX = '-stable';
exports.STABLE_LABEL_VALUE = 'stable';
function deleteCanaryDeployment(kubectl, manifestFilePaths, includeServices) {
    // get manifest files
    const inputManifestFiles = utils.getManifestFiles(manifestFilePaths);
    if (inputManifestFiles == null || inputManifestFiles.length == 0) {
        throw new Error('ManifestFileNotFound');
    }
    // create delete cmd prefix
    cleanUpCanary(kubectl, inputManifestFiles, includeServices);
}
exports.deleteCanaryDeployment = deleteCanaryDeployment;
function markResourceAsStable(inputObject) {
    if (isResourceMarkedAsStable(inputObject)) {
        return inputObject;
    }
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // Adding labels and annotations.
    addCanaryLabelsAndAnnotations(newObject, exports.STABLE_LABEL_VALUE);
    core.debug("Added stable label: " + JSON.stringify(newObject));
    return newObject;
}
exports.markResourceAsStable = markResourceAsStable;
function isResourceMarkedAsStable(inputObject) {
    return inputObject &&
        inputObject.metadata &&
        inputObject.metadata.labels &&
        inputObject.metadata.labels[exports.CANARY_VERSION_LABEL] == exports.STABLE_LABEL_VALUE;
}
exports.isResourceMarkedAsStable = isResourceMarkedAsStable;
function getStableResource(inputObject) {
    var replicaCount = isSpecContainsReplicas(inputObject.kind) ? inputObject.metadata.replicas : 0;
    return getNewCanaryObject(inputObject, replicaCount, exports.STABLE_LABEL_VALUE);
}
exports.getStableResource = getStableResource;
function getNewBaselineResource(stableObject, replicas) {
    return getNewCanaryObject(stableObject, replicas, exports.BASELINE_LABEL_VALUE);
}
exports.getNewBaselineResource = getNewBaselineResource;
function getNewCanaryResource(inputObject, replicas) {
    return getNewCanaryObject(inputObject, replicas, exports.CANARY_LABEL_VALUE);
}
exports.getNewCanaryResource = getNewCanaryResource;
function fetchCanaryResource(kubectl, kind, name) {
    return fetchResource(kubectl, kind, getCanaryResourceName(name));
}
exports.fetchCanaryResource = fetchCanaryResource;
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
function isCanaryDeploymentStrategy() {
    const deploymentStrategy = TaskInputParameters.deploymentStrategy;
    return deploymentStrategy && deploymentStrategy.toUpperCase() === exports.CANARY_DEPLOYMENT_STRATEGY;
}
exports.isCanaryDeploymentStrategy = isCanaryDeploymentStrategy;
function isSMICanaryStrategy() {
    const deploymentStrategy = TaskInputParameters.trafficSplitMethod;
    return isCanaryDeploymentStrategy() && deploymentStrategy && deploymentStrategy.toUpperCase() === exports.TRAFFIC_SPLIT_STRATEGY;
}
exports.isSMICanaryStrategy = isSMICanaryStrategy;
function getCanaryResourceName(name) {
    return name + CANARY_SUFFIX;
}
exports.getCanaryResourceName = getCanaryResourceName;
function getBaselineResourceName(name) {
    return name + BASELINE_SUFFIX;
}
exports.getBaselineResourceName = getBaselineResourceName;
function getStableResourceName(name) {
    return name + exports.STABLE_SUFFIX;
}
exports.getStableResourceName = getStableResourceName;
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
function getNewCanaryObject(inputObject, replicas, type) {
    const newObject = JSON.parse(JSON.stringify(inputObject));
    // Updating name
    if (type === exports.CANARY_LABEL_VALUE) {
        newObject.metadata.name = getCanaryResourceName(inputObject.metadata.name);
    }
    else if (type === exports.STABLE_LABEL_VALUE) {
        newObject.metadata.name = getStableResourceName(inputObject.metadata.name);
    }
    else {
        newObject.metadata.name = getBaselineResourceName(inputObject.metadata.name);
    }
    // Adding labels and annotations.
    addCanaryLabelsAndAnnotations(newObject, type);
    // Updating no. of replicas
    if (isSpecContainsReplicas(newObject.kind)) {
        newObject.spec.replicas = replicas;
    }
    return newObject;
}
function isSpecContainsReplicas(kind) {
    return !string_comparison_1.isEqual(kind, constants_1.KubernetesWorkload.pod, string_comparison_1.StringComparer.OrdinalIgnoreCase) &&
        !string_comparison_1.isEqual(kind, constants_1.KubernetesWorkload.daemonSet, string_comparison_1.StringComparer.OrdinalIgnoreCase) &&
        !helper.isServiceEntity(kind);
}
function addCanaryLabelsAndAnnotations(inputObject, type) {
    const newLabels = new Map();
    newLabels[exports.CANARY_VERSION_LABEL] = type;
    helper.updateObjectLabels(inputObject, newLabels, false);
    helper.updateSelectorLabels(inputObject, newLabels, false);
    if (!helper.isServiceEntity(inputObject.kind)) {
        helper.updateSpecLabels(inputObject, newLabels, false);
    }
}
function cleanUpCanary(kubectl, files, includeServices) {
    var deleteObject = function (kind, name) {
        try {
            const result = kubectl.delete([kind, name]);
            utility_1.checkForErrors([result]);
        }
        catch (ex) {
            // Ignore failures of delete if doesn't exist
        }
    };
    files.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (helper.isDeploymentEntity(kind) || (includeServices && helper.isServiceEntity(kind))) {
                const canaryObjectName = getCanaryResourceName(name);
                const baselineObjectName = getBaselineResourceName(name);
                deleteObject(kind, canaryObjectName);
                deleteObject(kind, baselineObjectName);
            }
        });
    });
}
