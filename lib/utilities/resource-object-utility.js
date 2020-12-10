'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResources = exports.updateSelectorLabels = exports.updateSpecLabels = exports.updateImagePullSecrets = exports.updateObjectAnnotations = exports.updateObjectLabels = exports.getReplicaCount = exports.isIngressEntity = exports.isServiceEntity = exports.isWorkloadEntity = exports.isDeploymentEntity = void 0;
const fs = require("fs");
const core = require("@actions/core");
const yaml = require("js-yaml");
const constants_1 = require("../constants");
const string_comparison_1 = require("./string-comparison");
const INGRESS = "Ingress";
function isDeploymentEntity(kind) {
    if (!kind) {
        throw ('ResourceKindNotDefined');
    }
    return constants_1.deploymentTypes.some((type) => {
        return string_comparison_1.isEqual(type, kind, string_comparison_1.StringComparer.OrdinalIgnoreCase);
    });
}
exports.isDeploymentEntity = isDeploymentEntity;
function isWorkloadEntity(kind) {
    if (!kind) {
        throw ('ResourceKindNotDefined');
    }
    return constants_1.workloadTypes.some((type) => {
        return string_comparison_1.isEqual(type, kind, string_comparison_1.StringComparer.OrdinalIgnoreCase);
    });
}
exports.isWorkloadEntity = isWorkloadEntity;
function isServiceEntity(kind) {
    if (!kind) {
        throw ('ResourceKindNotDefined');
    }
    return string_comparison_1.isEqual("Service", kind, string_comparison_1.StringComparer.OrdinalIgnoreCase);
}
exports.isServiceEntity = isServiceEntity;
function isIngressEntity(kind) {
    if (!kind) {
        throw ('ResourceKindNotDefined');
    }
    return string_comparison_1.isEqual(INGRESS, kind, string_comparison_1.StringComparer.OrdinalIgnoreCase);
}
exports.isIngressEntity = isIngressEntity;
function getReplicaCount(inputObject) {
    if (!inputObject) {
        throw ('NullInputObject');
    }
    if (!inputObject.kind) {
        throw ('ResourceKindNotDefined');
    }
    const kind = inputObject.kind;
    if (!string_comparison_1.isEqual(kind, constants_1.KubernetesWorkload.pod, string_comparison_1.StringComparer.OrdinalIgnoreCase) && !string_comparison_1.isEqual(kind, constants_1.KubernetesWorkload.daemonSet, string_comparison_1.StringComparer.OrdinalIgnoreCase)) {
        return inputObject.spec.replicas;
    }
    return 0;
}
exports.getReplicaCount = getReplicaCount;
function updateObjectLabels(inputObject, newLabels, override) {
    if (!inputObject) {
        throw ('NullInputObject');
    }
    if (!inputObject.metadata) {
        throw ('NullInputObjectMetadata');
    }
    if (!newLabels) {
        return;
    }
    if (override) {
        inputObject.metadata.labels = newLabels;
    }
    else {
        let existingLabels = inputObject.metadata.labels;
        if (!existingLabels) {
            existingLabels = new Map();
        }
        Object.keys(newLabels).forEach(function (key) {
            existingLabels[key] = newLabels[key];
        });
        inputObject.metadata.labels = existingLabels;
    }
}
exports.updateObjectLabels = updateObjectLabels;
function updateObjectAnnotations(inputObject, newAnnotations, override) {
    if (!inputObject) {
        throw ('NullInputObject');
    }
    if (!inputObject.metadata) {
        throw ('NullInputObjectMetadata');
    }
    if (!newAnnotations) {
        return;
    }
    if (override) {
        inputObject.metadata.annotations = newAnnotations;
    }
    else {
        let existingAnnotations = inputObject.metadata.annotations;
        if (!existingAnnotations) {
            existingAnnotations = new Map();
        }
        Object.keys(newAnnotations).forEach(function (key) {
            existingAnnotations[key] = newAnnotations[key];
        });
        inputObject.metadata.annotations = existingAnnotations;
    }
}
exports.updateObjectAnnotations = updateObjectAnnotations;
function updateImagePullSecrets(inputObject, newImagePullSecrets, override) {
    if (!inputObject || !inputObject.spec || !newImagePullSecrets) {
        return;
    }
    const newImagePullSecretsObjects = Array.from(newImagePullSecrets, x => { return { 'name': x }; });
    let existingImagePullSecretObjects = getImagePullSecrets(inputObject);
    if (override) {
        existingImagePullSecretObjects = newImagePullSecretsObjects;
    }
    else {
        if (!existingImagePullSecretObjects) {
            existingImagePullSecretObjects = new Array();
        }
        existingImagePullSecretObjects = existingImagePullSecretObjects.concat(newImagePullSecretsObjects);
    }
    setImagePullSecrets(inputObject, existingImagePullSecretObjects);
}
exports.updateImagePullSecrets = updateImagePullSecrets;
function updateSpecLabels(inputObject, newLabels, override) {
    if (!inputObject) {
        throw ('NullInputObject');
    }
    if (!inputObject.kind) {
        throw ('ResourceKindNotDefined');
    }
    if (!newLabels) {
        return;
    }
    let existingLabels = getSpecLabels(inputObject);
    if (override) {
        existingLabels = newLabels;
    }
    else {
        if (!existingLabels) {
            existingLabels = new Map();
        }
        Object.keys(newLabels).forEach(function (key) {
            existingLabels[key] = newLabels[key];
        });
    }
    setSpecLabels(inputObject, existingLabels);
}
exports.updateSpecLabels = updateSpecLabels;
function updateSelectorLabels(inputObject, newLabels, override) {
    if (!inputObject) {
        throw ('NullInputObject');
    }
    if (!inputObject.kind) {
        throw ('ResourceKindNotDefined');
    }
    if (!newLabels) {
        return;
    }
    if (string_comparison_1.isEqual(inputObject.kind, constants_1.KubernetesWorkload.pod, string_comparison_1.StringComparer.OrdinalIgnoreCase)) {
        return;
    }
    let existingLabels = getSpecSelectorLabels(inputObject);
    if (override) {
        existingLabels = newLabels;
    }
    else {
        if (!existingLabels) {
            existingLabels = new Map();
        }
        Object.keys(newLabels).forEach(function (key) {
            existingLabels[key] = newLabels[key];
        });
    }
    setSpecSelectorLabels(inputObject, existingLabels);
}
exports.updateSelectorLabels = updateSelectorLabels;
function getResources(filePaths, filterResourceTypes) {
    if (!filePaths) {
        return [];
    }
    const resources = [];
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const inputObjectKind = inputObject ? inputObject.kind : '';
            if (filterResourceTypes.filter(type => string_comparison_1.isEqual(inputObjectKind, type, string_comparison_1.StringComparer.OrdinalIgnoreCase)).length > 0) {
                const resource = {
                    type: inputObject.kind,
                    name: inputObject.metadata.name
                };
                resources.push(resource);
            }
        });
    });
    return resources;
}
exports.getResources = getResources;
function getSpecLabels(inputObject) {
    if (!inputObject) {
        return null;
    }
    if (string_comparison_1.isEqual(inputObject.kind, constants_1.KubernetesWorkload.pod, string_comparison_1.StringComparer.OrdinalIgnoreCase)) {
        return inputObject.metadata.labels;
    }
    if (!!inputObject.spec && !!inputObject.spec.template && !!inputObject.spec.template.metadata) {
        return inputObject.spec.template.metadata.labels;
    }
    return null;
}
function getImagePullSecrets(inputObject) {
    if (!inputObject || !inputObject.spec) {
        return null;
    }
    if (string_comparison_1.isEqual(inputObject.kind, constants_1.KubernetesWorkload.cronjob, string_comparison_1.StringComparer.OrdinalIgnoreCase)) {
        try {
            return inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets;
        }
        catch (ex) {
            core.debug(`Fetching imagePullSecrets failed due to this error: ${JSON.stringify(ex)}`);
            return null;
        }
    }
    if (string_comparison_1.isEqual(inputObject.kind, constants_1.KubernetesWorkload.pod, string_comparison_1.StringComparer.OrdinalIgnoreCase)) {
        return inputObject.spec.imagePullSecrets;
    }
    if (!!inputObject.spec.template && !!inputObject.spec.template.spec) {
        return inputObject.spec.template.spec.imagePullSecrets;
    }
    return null;
}
function setImagePullSecrets(inputObject, newImagePullSecrets) {
    if (!inputObject || !inputObject.spec || !newImagePullSecrets) {
        return;
    }
    if (string_comparison_1.isEqual(inputObject.kind, constants_1.KubernetesWorkload.pod, string_comparison_1.StringComparer.OrdinalIgnoreCase)) {
        inputObject.spec.imagePullSecrets = newImagePullSecrets;
        return;
    }
    if (string_comparison_1.isEqual(inputObject.kind, constants_1.KubernetesWorkload.cronjob, string_comparison_1.StringComparer.OrdinalIgnoreCase)) {
        try {
            inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets = newImagePullSecrets;
        }
        catch (ex) {
            core.debug(`Overriding imagePullSecrets failed due to this error: ${JSON.stringify(ex)}`);
            //Do nothing
        }
        return;
    }
    if (!!inputObject.spec.template && !!inputObject.spec.template.spec) {
        inputObject.spec.template.spec.imagePullSecrets = newImagePullSecrets;
        return;
    }
    return;
}
function setSpecLabels(inputObject, newLabels) {
    let specLabels = getSpecLabels(inputObject);
    if (!!newLabels) {
        specLabels = newLabels;
    }
}
function getSpecSelectorLabels(inputObject) {
    if (!!inputObject && !!inputObject.spec && !!inputObject.spec.selector) {
        if (isServiceEntity(inputObject.kind)) {
            return inputObject.spec.selector;
        }
        else {
            return inputObject.spec.selector.matchLabels;
        }
    }
    return null;
}
function setSpecSelectorLabels(inputObject, newLabels) {
    let selectorLabels = getSpecSelectorLabels(inputObject);
    if (!!selectorLabels) {
        selectorLabels = newLabels;
    }
}
