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
exports.getStableResourceName = exports.getBaselineResourceName = exports.getCanaryResourceName = exports.fetchResource = exports.getNewCanaryResource = exports.getNewBaselineResource = exports.getStableResource = exports.isResourceMarkedAsStable = exports.markResourceAsStable = exports.deleteCanaryDeployment = exports.STABLE_LABEL_VALUE = exports.STABLE_SUFFIX = exports.CANARY_LABEL_VALUE = exports.BASELINE_LABEL_VALUE = exports.CANARY_VERSION_LABEL = void 0;
const fs = require("fs");
const yaml = require("js-yaml");
const core = require("@actions/core");
const kubernetesTypes_1 = require("../../types/kubernetesTypes");
const utils = require("../../utilities/manifestUpdateUtils");
const manifestUpdateUtils_1 = require("../../utilities/manifestUpdateUtils");
const manifestSpecLabelUtils_1 = require("../../utilities/manifestSpecLabelUtils");
const kubectlUtils_1 = require("../../utilities/kubectlUtils");
exports.CANARY_VERSION_LABEL = "workflow/version";
const BASELINE_SUFFIX = "-baseline";
exports.BASELINE_LABEL_VALUE = "baseline";
const CANARY_SUFFIX = "-canary";
exports.CANARY_LABEL_VALUE = "canary";
exports.STABLE_SUFFIX = "-stable";
exports.STABLE_LABEL_VALUE = "stable";
function deleteCanaryDeployment(kubectl, manifestFilePaths, includeServices) {
    return __awaiter(this, void 0, void 0, function* () {
        if (manifestFilePaths == null || manifestFilePaths.length == 0) {
            throw new Error("Manifest file not found");
        }
        yield cleanUpCanary(kubectl, manifestFilePaths, includeServices);
    });
}
exports.deleteCanaryDeployment = deleteCanaryDeployment;
function markResourceAsStable(inputObject) {
    if (isResourceMarkedAsStable(inputObject)) {
        return inputObject;
    }
    const newObject = JSON.parse(JSON.stringify(inputObject));
    addCanaryLabelsAndAnnotations(newObject, exports.STABLE_LABEL_VALUE);
    return newObject;
}
exports.markResourceAsStable = markResourceAsStable;
function isResourceMarkedAsStable(inputObject) {
    var _a;
    return (((_a = inputObject === null || inputObject === void 0 ? void 0 : inputObject.metadata) === null || _a === void 0 ? void 0 : _a.labels[exports.CANARY_VERSION_LABEL]) === exports.STABLE_LABEL_VALUE);
}
exports.isResourceMarkedAsStable = isResourceMarkedAsStable;
function getStableResource(inputObject) {
    const replicaCount = specContainsReplicas(inputObject.kind)
        ? inputObject.metadata.replicas
        : 0;
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
function fetchResource(kubectl, kind, name) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield kubectl.getResource(kind, name);
        if (!result || (result === null || result === void 0 ? void 0 : result.stderr)) {
            return null;
        }
        if (result.stdout) {
            const resource = JSON.parse(result.stdout);
            try {
                utils.UnsetClusterSpecificDetails(resource);
                return resource;
            }
            catch (ex) {
                core.debug(`Exception occurred while Parsing ${resource} in JSON object: ${ex}`);
            }
        }
    });
}
exports.fetchResource = fetchResource;
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
    addCanaryLabelsAndAnnotations(newObject, type);
    if (specContainsReplicas(newObject.kind)) {
        newObject.spec.replicas = replicas;
    }
    return newObject;
}
function specContainsReplicas(kind) {
    return (kind.toLowerCase() !== kubernetesTypes_1.KubernetesWorkload.POD.toLowerCase() &&
        kind.toLowerCase() !== kubernetesTypes_1.KubernetesWorkload.DAEMON_SET.toLowerCase() &&
        !kubernetesTypes_1.isServiceEntity(kind));
}
function addCanaryLabelsAndAnnotations(inputObject, type) {
    const newLabels = new Map();
    newLabels[exports.CANARY_VERSION_LABEL] = type;
    manifestUpdateUtils_1.updateObjectLabels(inputObject, newLabels, false);
    manifestUpdateUtils_1.updateObjectAnnotations(inputObject, newLabels, false);
    manifestUpdateUtils_1.updateSelectorLabels(inputObject, newLabels, false);
    if (!kubernetesTypes_1.isServiceEntity(inputObject.kind)) {
        manifestSpecLabelUtils_1.updateSpecLabels(inputObject, newLabels, false);
    }
}
function cleanUpCanary(kubectl, files, includeServices) {
    return __awaiter(this, void 0, void 0, function* () {
        const deleteObject = function (kind, name) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const result = yield kubectl.delete([kind, name]);
                    kubectlUtils_1.checkForErrors([result]);
                }
                catch (ex) {
                    // Ignore failures of delete if it doesn't exist
                }
            });
        };
        for (const filePath of files) {
            const fileContents = fs.readFileSync(filePath).toString();
            const parsedYaml = yaml.safeLoadAll(fileContents);
            for (const inputObject of parsedYaml) {
                const name = inputObject.metadata.name;
                const kind = inputObject.kind;
                if (kubernetesTypes_1.isDeploymentEntity(kind) ||
                    (includeServices && kubernetesTypes_1.isServiceEntity(kind))) {
                    const canaryObjectName = getCanaryResourceName(name);
                    const baselineObjectName = getBaselineResourceName(name);
                    yield deleteObject(kind, canaryObjectName);
                    yield deleteObject(kind, baselineObjectName);
                }
            }
        }
    });
}
