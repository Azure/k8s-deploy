'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.deployPodCanary = void 0;
const core = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const TaskInputParameters = require("../../input-parameters");
const fileHelper = require("../files-helper");
const helper = require("../resource-object-utility");
const canaryDeploymentHelper = require("./canary-deployment-helper");
function deployPodCanary(kubectl, filePaths) {
    const newObjectsList = [];
    const percentage = parseInt(TaskInputParameters.canaryPercentage);
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (helper.isDeploymentEntity(kind)) {
                core.debug('Calculating replica count for canary');
                const canaryReplicaCount = calculateReplicaCountForCanary(inputObject, percentage);
                core.debug('Replica count is ' + canaryReplicaCount);
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
    const result = kubectl.apply(manifestFiles);
    return { 'result': result, 'newFilePaths': manifestFiles };
}
exports.deployPodCanary = deployPodCanary;
function calculateReplicaCountForCanary(inputObject, percentage) {
    const inputReplicaCount = helper.getReplicaCount(inputObject);
    return Math.round((inputReplicaCount * percentage) / 100);
}
