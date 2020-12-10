'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.redirectTrafficToStableDeployment = exports.redirectTrafficToCanaryDeployment = exports.deploySMICanary = void 0;
const core = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const util = require("util");
const TaskInputParameters = require("../../input-parameters");
const fileHelper = require("../files-helper");
const helper = require("../resource-object-utility");
const utils = require("../manifest-utilities");
const kubectlUtils = require("../kubectl-util");
const canaryDeploymentHelper = require("./canary-deployment-helper");
const utility_1 = require("../utility");
const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = '-workflow-rollout';
const TRAFFIC_SPLIT_OBJECT = 'TrafficSplit';
let trafficSplitAPIVersion = "";
function deploySMICanary(kubectl, filePaths) {
    const newObjectsList = [];
    const canaryReplicaCount = parseInt(TaskInputParameters.baselineAndCanaryReplicas);
    core.debug('Replica count is ' + canaryReplicaCount);
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (helper.isDeploymentEntity(kind)) {
                // Get stable object
                core.debug('Querying stable object');
                const stableObject = canaryDeploymentHelper.fetchResource(kubectl, kind, name);
                if (!stableObject) {
                    core.debug('Stable object not found. Creating only canary object');
                    // If stable object not found, create canary deployment.
                    const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(inputObject, canaryReplicaCount);
                    core.debug('New canary object is: ' + JSON.stringify(newCanaryObject));
                    newObjectsList.push(newCanaryObject);
                }
                else {
                    if (!canaryDeploymentHelper.isResourceMarkedAsStable(stableObject)) {
                        throw (`StableSpecSelectorNotExist : ${name}`);
                    }
                    core.debug('Stable object found. Creating canary and baseline objects');
                    // If canary object not found, create canary and baseline object.
                    const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(inputObject, canaryReplicaCount);
                    const newBaselineObject = canaryDeploymentHelper.getNewBaselineResource(stableObject, canaryReplicaCount);
                    core.debug('New canary object is: ' + JSON.stringify(newCanaryObject));
                    core.debug('New baseline object is: ' + JSON.stringify(newBaselineObject));
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
    const result = kubectl.apply(manifestFiles, TaskInputParameters.forceDeployment);
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
                core.debug('New canary service object is: ' + JSON.stringify(newCanaryServiceObject));
                newObjectsList.push(newCanaryServiceObject);
                const newBaselineServiceObject = canaryDeploymentHelper.getNewBaselineResource(inputObject);
                core.debug('New baseline object is: ' + JSON.stringify(newBaselineServiceObject));
                newObjectsList.push(newBaselineServiceObject);
                core.debug('Querying for stable service object');
                const stableObject = canaryDeploymentHelper.fetchResource(kubectl, kind, canaryDeploymentHelper.getStableResourceName(name));
                if (!stableObject) {
                    const newStableServiceObject = canaryDeploymentHelper.getStableResource(inputObject);
                    core.debug('New stable service object is: ' + JSON.stringify(newStableServiceObject));
                    newObjectsList.push(newStableServiceObject);
                    core.debug('Creating the traffic object for service: ' + name);
                    const trafficObject = createTrafficSplitManifestFile(kubectl, name, 0, 0, 1000);
                    core.debug('Creating the traffic object for service: ' + trafficObject);
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
                                    core.debug('Update traffic objcet not required');
                                    updateTrafficObject = false;
                                }
                            });
                        }
                    }
                    if (updateTrafficObject) {
                        core.debug('Stable service object present so updating the traffic object for service: ' + name);
                        trafficObjectsList.push(updateTrafficSplitObject(kubectl, name));
                    }
                }
            }
        });
    });
    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    manifestFiles.push(...trafficObjectsList);
    const result = kubectl.apply(manifestFiles, TaskInputParameters.forceDeployment);
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
                trafficSplitManifests.push(createTrafficSplitManifestFile(kubectl, name, stableWeight, 0, canaryWeight));
                serviceObjects.push(name);
            }
        });
    });
    if (trafficSplitManifests.length <= 0) {
        return;
    }
    const result = kubectl.apply(trafficSplitManifests, TaskInputParameters.forceDeployment);
    core.debug('serviceObjects:' + serviceObjects.join(',') + ' result:' + result);
    utility_1.checkForErrors([result]);
}
function updateTrafficSplitObject(kubectl, serviceName) {
    const percentage = parseInt(TaskInputParameters.canaryPercentage) * 10;
    const baselineAndCanaryWeight = percentage / 2;
    const stableDeploymentWeight = 1000 - percentage;
    core.debug('Creating the traffic object with canary weight: ' + baselineAndCanaryWeight + ',baseling weight: ' + baselineAndCanaryWeight + ',stable: ' + stableDeploymentWeight);
    return createTrafficSplitManifestFile(kubectl, serviceName, stableDeploymentWeight, baselineAndCanaryWeight, baselineAndCanaryWeight);
}
function createTrafficSplitManifestFile(kubectl, serviceName, stableWeight, baselineWeight, canaryWeight) {
    const smiObjectString = getTrafficSplitObject(kubectl, serviceName, stableWeight, baselineWeight, canaryWeight);
    const manifestFile = fileHelper.writeManifestToFile(smiObjectString, TRAFFIC_SPLIT_OBJECT, serviceName);
    if (!manifestFile) {
        throw new Error('UnableToCreateTrafficSplitManifestFile');
    }
    return manifestFile;
}
function getTrafficSplitObject(kubectl, name, stableWeight, baselineWeight, canaryWeight) {
    if (!trafficSplitAPIVersion) {
        trafficSplitAPIVersion = kubectlUtils.getTrafficSplitAPIVersion(kubectl);
    }
    const trafficSplitObjectJson = `{
        "apiVersion": "${trafficSplitAPIVersion}",
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
