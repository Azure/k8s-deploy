'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const tl = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const util = require("util");
const TaskInputParameters = require("../input-parameters");
const fileHelper = require("./FileHelper");
const helper = require("./KubernetesObjectUtility");
const utils = require("./utilities");
const canaryDeploymentHelper = require("./CanaryDeploymentHelper");
const utility_1 = require("../utility");
const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = '-azure-pipelines-rollout';
const TRAFFIC_SPLIT_OBJECT = 'TrafficSplit';
function deploySMICanary(kubectl, filePaths) {
    const newObjectsList = [];
    const canaryReplicaCount = parseInt(TaskInputParameters.baselineAndCanaryReplicas);
    tl.debug('Replica count is ' + canaryReplicaCount);
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (helper.isDeploymentEntity(kind)) {
                // Get stable object
                tl.debug('Querying stable object');
                const stableObject = canaryDeploymentHelper.fetchResource(kubectl, kind, name);
                if (!stableObject) {
                    tl.debug('Stable object not found. Creating only canary object');
                    // If stable object not found, create canary deployment.
                    const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(inputObject, canaryReplicaCount);
                    tl.debug('New canary object is: ' + JSON.stringify(newCanaryObject));
                    newObjectsList.push(newCanaryObject);
                }
                else {
                    if (!canaryDeploymentHelper.isResourceMarkedAsStable(stableObject)) {
                        throw (`StableSpecSelectorNotExist : ${name}`);
                    }
                    tl.debug('Stable object found. Creating canary and baseline objects');
                    // If canary object not found, create canary and baseline object.
                    const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(inputObject, canaryReplicaCount);
                    const newBaselineObject = canaryDeploymentHelper.getNewBaselineResource(stableObject, canaryReplicaCount);
                    tl.debug('New canary object is: ' + JSON.stringify(newCanaryObject));
                    tl.debug('New baseline object is: ' + JSON.stringify(newBaselineObject));
                    newObjectsList.push(newCanaryObject);
                    newObjectsList.push(newBaselineObject);
                }
            }
            else {
                // Updating non deployment entity as it is.
                newObjectsList.push(inputObject);
            }
        });
    });
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    const result = kubectl.apply(manifestFiles);
    createCanaryService(kubectl, filePaths);
    return { 'result': result, 'newFilePaths': manifestFiles };
}
exports.deploySMICanary = deploySMICanary;
function createCanaryService(kubectl, filePaths) {
    const newObjectsList = [];
    const trafficObjectsList = [];
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (helper.isServiceEntity(kind)) {
                const newCanaryServiceObject = canaryDeploymentHelper.getNewCanaryResource(inputObject);
                tl.debug('New canary service object is: ' + JSON.stringify(newCanaryServiceObject));
                newObjectsList.push(newCanaryServiceObject);
                const newBaselineServiceObject = canaryDeploymentHelper.getNewBaselineResource(inputObject);
                tl.debug('New baseline object is: ' + JSON.stringify(newBaselineServiceObject));
                newObjectsList.push(newBaselineServiceObject);
                tl.debug('Querying for stable service object');
                const stableObject = canaryDeploymentHelper.fetchResource(kubectl, kind, canaryDeploymentHelper.getStableResourceName(name));
                if (!stableObject) {
                    const newStableServiceObject = canaryDeploymentHelper.getStableResource(inputObject);
                    tl.debug('New stable service object is: ' + JSON.stringify(newStableServiceObject));
                    newObjectsList.push(newStableServiceObject);
                    tl.debug('Creating the traffic object for service: ' + name);
                    const trafficObject = createTrafficSplitManifestFile(name, 0, 0, 1000);
                    tl.debug('Creating the traffic object for service: ' + trafficObject);
                    trafficObjectsList.push(trafficObject);
                }
                else {
                    let updateTrafficObject = true;
                    const trafficObject = canaryDeploymentHelper.fetchResource(kubectl, TRAFFIC_SPLIT_OBJECT, getTrafficSplitResourceName(name));
                    if (trafficObject) {
                        const trafficJObject = JSON.parse(JSON.stringify(trafficObject));
                        if (trafficJObject && trafficJObject.spec && trafficJObject.spec.backends) {
                            trafficJObject.spec.backends.forEach((s) => {
                                if (s.service === canaryDeploymentHelper.getCanaryResourceName(name) && s.weight === "1000m") {
                                    tl.debug('Update traffic objcet not required');
                                    updateTrafficObject = false;
                                }
                            });
                        }
                    }
                    if (updateTrafficObject) {
                        tl.debug('Stable service object present so updating the traffic object for service: ' + name);
                        trafficObjectsList.push(updateTrafficSplitObject(name));
                    }
                }
            }
        });
    });
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    manifestFiles.push(...trafficObjectsList);
    const result = kubectl.apply(manifestFiles);
    utility_1.checkForErrors([result]);
}
function redirectTrafficToCanaryDeployment(kubectl, manifestFilePaths) {
    adjustTraffic(kubectl, manifestFilePaths, 0, 1000);
}
exports.redirectTrafficToCanaryDeployment = redirectTrafficToCanaryDeployment;
function redirectTrafficToStableDeployment(kubectl, manifestFilePaths) {
    adjustTraffic(kubectl, manifestFilePaths, 1000, 0);
}
exports.redirectTrafficToStableDeployment = redirectTrafficToStableDeployment;
function adjustTraffic(kubectl, manifestFilePaths, stableWeight, canaryWeight) {
    // get manifest files
    const inputManifestFiles = utils.getManifestFiles(manifestFilePaths);
    if (inputManifestFiles == null || inputManifestFiles.length == 0) {
        return;
    }
    const trafficSplitManifests = [];
    const serviceObjects = [];
    inputManifestFiles.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (helper.isServiceEntity(kind)) {
                trafficSplitManifests.push(createTrafficSplitManifestFile(name, stableWeight, 0, canaryWeight));
                serviceObjects.push(name);
            }
        });
    });
    if (trafficSplitManifests.length <= 0) {
        return;
    }
    const result = kubectl.apply(trafficSplitManifests);
    tl.debug('serviceObjects:' + serviceObjects.join(',') + ' result:' + result);
    utility_1.checkForErrors([result]);
}
function updateTrafficSplitObject(serviceName) {
    const percentage = parseInt(TaskInputParameters.canaryPercentage) * 10;
    const baselineAndCanaryWeight = percentage / 2;
    const stableDeploymentWeight = 1000 - percentage;
    tl.debug('Creating the traffic object with canary weight: ' + baselineAndCanaryWeight + ',baseling weight: ' + baselineAndCanaryWeight + ',stable: ' + stableDeploymentWeight);
    return createTrafficSplitManifestFile(serviceName, stableDeploymentWeight, baselineAndCanaryWeight, baselineAndCanaryWeight);
}
function createTrafficSplitManifestFile(serviceName, stableWeight, baselineWeight, canaryWeight) {
    const smiObjectString = getTrafficSplitObject(serviceName, stableWeight, baselineWeight, canaryWeight);
    const manifestFile = fileHelper.writeManifestToFile(smiObjectString, TRAFFIC_SPLIT_OBJECT, serviceName);
    if (!manifestFile) {
        throw new Error('UnableToCreateTrafficSplitManifestFile');
    }
    return manifestFile;
}
function getTrafficSplitObject(name, stableWeight, baselineWeight, canaryWeight) {
    const trafficSplitObjectJson = `{
        "apiVersion": "split.smi-spec.io/v1alpha1",
        "kind": "TrafficSplit",
        "metadata": {
            "name": "%s"
        },
        "spec": {
            "backends": [
                {
                    "service": "%s",
                    "weight": "%sm"
                },
                {
                    "service": "%s",
                    "weight": "%sm"
                },
                {
                    "service": "%s",
                    "weight": "%sm"
                }
            ],
            "service": "%s"
        }
    }`;
    const trafficSplitObject = util.format(trafficSplitObjectJson, getTrafficSplitResourceName(name), canaryDeploymentHelper.getStableResourceName(name), stableWeight, canaryDeploymentHelper.getBaselineResourceName(name), baselineWeight, canaryDeploymentHelper.getCanaryResourceName(name), canaryWeight, name);
    return trafficSplitObject;
}
function getTrafficSplitResourceName(name) {
    return name + TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX;
}
