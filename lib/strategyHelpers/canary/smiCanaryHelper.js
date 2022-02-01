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
exports.redirectTrafficToStableDeployment = exports.redirectTrafficToCanaryDeployment = exports.deploySMICanary = void 0;
const core = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const fileHelper = require("../../utilities/fileUtils");
const kubectlUtils = require("../../utilities/trafficSplitUtils");
const canaryDeploymentHelper = require("./canaryHelper");
const kubernetesTypes_1 = require("../../types/kubernetesTypes");
const kubectlUtils_1 = require("../../utilities/kubectlUtils");
const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = "-workflow-rollout";
const TRAFFIC_SPLIT_OBJECT = "TrafficSplit";
function deploySMICanary(filePaths, kubectl) {
    return __awaiter(this, void 0, void 0, function* () {
        const canaryReplicaCount = parseInt(core.getInput("baseline-and-canary-replicas"));
        if (canaryReplicaCount < 0 || canaryReplicaCount > 100)
            throw Error("Baseline-and-canary-replicas must be between 0 and 100");
        const newObjectsList = [];
        filePaths.forEach((filePath) => {
            const fileContents = fs.readFileSync(filePath).toString();
            yaml.safeLoadAll(fileContents, (inputObject) => {
                const name = inputObject.metadata.name;
                const kind = inputObject.kind;
                if (kubernetesTypes_1.isDeploymentEntity(kind)) {
                    const stableObject = canaryDeploymentHelper.fetchResource(kubectl, kind, name);
                    if (!stableObject) {
                        core.debug("Stable object not found. Creating only canary object");
                        const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(inputObject, canaryReplicaCount);
                        newObjectsList.push(newCanaryObject);
                    }
                    else {
                        if (!canaryDeploymentHelper.isResourceMarkedAsStable(stableObject)) {
                            throw Error(`StableSpecSelectorNotExist : ${name}`);
                        }
                        core.debug("Stable object found. Creating canary and baseline objects");
                        const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(inputObject, canaryReplicaCount);
                        const newBaselineObject = canaryDeploymentHelper.getNewBaselineResource(stableObject, canaryReplicaCount);
                        newObjectsList.push(newCanaryObject);
                        newObjectsList.push(newBaselineObject);
                    }
                }
                else {
                    // Update non deployment entity as it is
                    newObjectsList.push(inputObject);
                }
            });
        });
        const newFilePaths = fileHelper.writeObjectsToFile(newObjectsList);
        const forceDeployment = core.getInput("force").toLowerCase() === "true";
        const result = yield kubectl.apply(newFilePaths, forceDeployment);
        yield createCanaryService(kubectl, filePaths);
        return { result, newFilePaths };
    });
}
exports.deploySMICanary = deploySMICanary;
function createCanaryService(kubectl, filePaths) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const newObjectsList = [];
        const trafficObjectsList = [];
        for (const filePath of filePaths) {
            const fileContents = fs.readFileSync(filePath).toString();
            const parsedYaml = yaml.safeLoadAll(fileContents);
            for (const inputObject of parsedYaml) {
                const name = inputObject.metadata.name;
                const kind = inputObject.kind;
                if (kubernetesTypes_1.isServiceEntity(kind)) {
                    const newCanaryServiceObject = canaryDeploymentHelper.getNewCanaryResource(inputObject);
                    newObjectsList.push(newCanaryServiceObject);
                    const newBaselineServiceObject = canaryDeploymentHelper.getNewBaselineResource(inputObject);
                    newObjectsList.push(newBaselineServiceObject);
                    const stableObject = yield canaryDeploymentHelper.fetchResource(kubectl, kind, canaryDeploymentHelper.getStableResourceName(name));
                    if (!stableObject) {
                        const newStableServiceObject = canaryDeploymentHelper.getStableResource(inputObject);
                        newObjectsList.push(newStableServiceObject);
                        core.debug("Creating the traffic object for service: " + name);
                        const trafficObject = yield createTrafficSplitManifestFile(kubectl, name, 0, 0, 1000);
                        trafficObjectsList.push(trafficObject);
                    }
                    else {
                        let updateTrafficObject = true;
                        const trafficObject = yield canaryDeploymentHelper.fetchResource(kubectl, TRAFFIC_SPLIT_OBJECT, getTrafficSplitResourceName(name));
                        if (trafficObject) {
                            const trafficJObject = JSON.parse(JSON.stringify(trafficObject));
                            if ((_a = trafficJObject === null || trafficJObject === void 0 ? void 0 : trafficJObject.spec) === null || _a === void 0 ? void 0 : _a.backends) {
                                trafficJObject.spec.backends.forEach((s) => {
                                    if (s.service ===
                                        canaryDeploymentHelper.getCanaryResourceName(name) &&
                                        s.weight === "1000m") {
                                        core.debug("Update traffic objcet not required");
                                        updateTrafficObject = false;
                                    }
                                });
                            }
                        }
                        if (updateTrafficObject) {
                            core.debug("Stable service object present so updating the traffic object for service: " +
                                name);
                            trafficObjectsList.push(updateTrafficSplitObject(kubectl, name));
                        }
                    }
                }
            }
        }
        const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
        manifestFiles.push(...trafficObjectsList);
        const forceDeployment = core.getInput("force").toLowerCase() === "true";
        const result = yield kubectl.apply(manifestFiles, forceDeployment);
        kubectlUtils_1.checkForErrors([result]);
    });
}
function redirectTrafficToCanaryDeployment(kubectl, manifestFilePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        yield adjustTraffic(kubectl, manifestFilePaths, 0, 1000);
    });
}
exports.redirectTrafficToCanaryDeployment = redirectTrafficToCanaryDeployment;
function redirectTrafficToStableDeployment(kubectl, manifestFilePaths) {
    return __awaiter(this, void 0, void 0, function* () {
        yield adjustTraffic(kubectl, manifestFilePaths, 1000, 0);
    });
}
exports.redirectTrafficToStableDeployment = redirectTrafficToStableDeployment;
function adjustTraffic(kubectl, manifestFilePaths, stableWeight, canaryWeight) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!manifestFilePaths || (manifestFilePaths === null || manifestFilePaths === void 0 ? void 0 : manifestFilePaths.length) == 0) {
            return;
        }
        const trafficSplitManifests = [];
        for (const filePath of manifestFilePaths) {
            const fileContents = fs.readFileSync(filePath).toString();
            const parsedYaml = yaml.safeLoadAll(fileContents);
            for (const inputObject of parsedYaml) {
                const name = inputObject.metadata.name;
                const kind = inputObject.kind;
                if (kubernetesTypes_1.isServiceEntity(kind)) {
                    trafficSplitManifests.push(yield createTrafficSplitManifestFile(kubectl, name, stableWeight, 0, canaryWeight));
                }
            }
        }
        if (trafficSplitManifests.length <= 0) {
            return;
        }
        const forceDeployment = core.getInput("force").toLowerCase() === "true";
        const result = yield kubectl.apply(trafficSplitManifests, forceDeployment);
        kubectlUtils_1.checkForErrors([result]);
    });
}
function updateTrafficSplitObject(kubectl, serviceName) {
    return __awaiter(this, void 0, void 0, function* () {
        const percentage = parseInt(core.getInput("percentage"));
        if (percentage < 0 || percentage > 100)
            throw Error("Percentage must be between 0 and 100");
        const percentageWithMuliplier = percentage * 10;
        const baselineAndCanaryWeight = percentageWithMuliplier / 2;
        const stableDeploymentWeight = 1000 - percentageWithMuliplier;
        core.debug("Creating the traffic object with canary weight: " +
            baselineAndCanaryWeight +
            ",baseling weight: " +
            baselineAndCanaryWeight +
            ",stable: " +
            stableDeploymentWeight);
        return yield createTrafficSplitManifestFile(kubectl, serviceName, stableDeploymentWeight, baselineAndCanaryWeight, baselineAndCanaryWeight);
    });
}
function createTrafficSplitManifestFile(kubectl, serviceName, stableWeight, baselineWeight, canaryWeight) {
    return __awaiter(this, void 0, void 0, function* () {
        const smiObjectString = yield getTrafficSplitObject(kubectl, serviceName, stableWeight, baselineWeight, canaryWeight);
        const manifestFile = fileHelper.writeManifestToFile(smiObjectString, TRAFFIC_SPLIT_OBJECT, serviceName);
        if (!manifestFile) {
            throw new Error("Unable to create traffic split manifest file");
        }
        return manifestFile;
    });
}
let trafficSplitAPIVersion = "";
function getTrafficSplitObject(kubectl, name, stableWeight, baselineWeight, canaryWeight) {
    return __awaiter(this, void 0, void 0, function* () {
        // cached version
        if (!trafficSplitAPIVersion) {
            trafficSplitAPIVersion = yield kubectlUtils.getTrafficSplitAPIVersion(kubectl);
        }
        return JSON.stringify({
            apiVersion: trafficSplitAPIVersion,
            kind: "TrafficSplit",
            metadata: {
                name: getTrafficSplitResourceName(name),
            },
            spec: {
                backends: [
                    {
                        service: canaryDeploymentHelper.getStableResourceName(name),
                        weight: stableWeight,
                    },
                    {
                        service: canaryDeploymentHelper.getBaselineResourceName(name),
                        weight: baselineWeight,
                    },
                    {
                        service: canaryDeploymentHelper.getCanaryResourceName(name),
                        weight: canaryWeight,
                    },
                ],
                service: name,
            },
        });
    });
}
function getTrafficSplitResourceName(name) {
    return name + TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX;
}
