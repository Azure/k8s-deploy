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
exports.deployPodCanary = void 0;
const core = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const fileHelper = require("../../utilities/fileUtils");
const canaryDeploymentHelper = require("./canaryHelper");
const kubernetesTypes_1 = require("../../types/kubernetesTypes");
const manifestUpdateUtils_1 = require("../../utilities/manifestUpdateUtils");
function deployPodCanary(filePaths, kubectl) {
    return __awaiter(this, void 0, void 0, function* () {
        const newObjectsList = [];
        const percentage = parseInt(core.getInput("percentage"));
        if (percentage < 0 || percentage > 100)
            throw Error("Percentage must be between 0 and 100");
        for (const filePath of filePaths) {
            const fileContents = fs.readFileSync(filePath).toString();
            const parsedYaml = yaml.safeLoadAll(fileContents);
            for (const inputObject of parsedYaml) {
                const name = inputObject.metadata.name;
                const kind = inputObject.kind;
                if (kubernetesTypes_1.isDeploymentEntity(kind)) {
                    core.debug("Calculating replica count for canary");
                    const canaryReplicaCount = calculateReplicaCountForCanary(inputObject, percentage);
                    core.debug("Replica count is " + canaryReplicaCount);
                    // Get stable object
                    core.debug("Querying stable object");
                    const stableObject = yield canaryDeploymentHelper.fetchResource(kubectl, kind, name);
                    if (!stableObject) {
                        core.debug("Stable object not found. Creating canary object");
                        const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(inputObject, canaryReplicaCount);
                        newObjectsList.push(newCanaryObject);
                    }
                    else {
                        core.debug("Creating canary and baseline objects. Stable object found: " +
                            JSON.stringify(stableObject));
                        const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(inputObject, canaryReplicaCount);
                        core.debug("New canary object: " + JSON.stringify(newCanaryObject));
                        const newBaselineObject = canaryDeploymentHelper.getNewBaselineResource(stableObject, canaryReplicaCount);
                        core.debug("New baseline object: " + JSON.stringify(newBaselineObject));
                        newObjectsList.push(newCanaryObject);
                        newObjectsList.push(newBaselineObject);
                    }
                }
                else {
                    // update non deployment entity as it is
                    newObjectsList.push(inputObject);
                }
            }
        }
        core.debug("New objects list: " + JSON.stringify(newObjectsList));
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        const forceDeployment = core.getInput("force").toLowerCase() === "true";
        const result = yield kubectl.apply(manifestFiles, forceDeployment);
        return { result, newFilePaths: manifestFiles };
    });
}
exports.deployPodCanary = deployPodCanary;
function calculateReplicaCountForCanary(inputObject, percentage) {
    const inputReplicaCount = manifestUpdateUtils_1.getReplicaCount(inputObject);
    return Math.round((inputReplicaCount * percentage) / 100);
}
