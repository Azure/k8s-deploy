'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResources = exports.updateSelectorLabels = exports.updateSpecLabels = exports.updateImageDetails = exports.updateImagePullSecrets = exports.updateObjectLabels = exports.getReplicaCount = exports.isServiceEntity = exports.isWorkloadEntity = exports.isDeploymentEntity = void 0;
const fs = require("fs");
const core = require("@actions/core");
const yaml = require("js-yaml");
const constants_1 = require("../constants");
const string_comparison_1 = require("./string-comparison");
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
function updateImageDetails(inputObject, containers) {
    if (!inputObject || !inputObject.spec || !containers) {
        return;
    }
    if (inputObject.spec.template && !!inputObject.spec.template.spec) {
        if (inputObject.spec.template.spec.containers) {
            updateContainers(inputObject.spec.template.spec.containers, containers);
        }
        if (inputObject.spec.template.spec.initContainers) {
            updateContainers(inputObject.spec.template.spec.initContainers, containers);
        }
        return;
    }
    if (inputObject.spec.jobTemplate && inputObject.spec.jobTemplate.spec && inputObject.spec.jobTemplate.spec.template && inputObject.spec.jobTemplate.spec.template.spec) {
        if (inputObject.spec.jobTemplate.spec.template.spec.containers) {
            updateContainers(inputObject.spec.jobTemplate.spec.template.spec.containers, containers);
        }
        if (inputObject.spec.jobTemplate.spec.template.spec.initContainers) {
            updateContainers(inputObject.spec.jobTemplate.spec.template.spec.initContainers, containers);
        }
        return;
    }
    if (inputObject.spec.containers) {
        updateContainers(inputObject.spec.containers, containers);
    }
    if (inputObject.spec.initContainers) {
        updateContainers(inputObject.spec.initContainers, containers);
    }
}
exports.updateImageDetails = updateImageDetails;
function updateContainers(containers, images) {
    if (!containers || containers.length === 0) {
        return containers;
    }
    containers.forEach((container) => {
        const imageName = extractImageName(container.image.trim());
        images.forEach(image => {
            if (extractImageName(image) === imageName) {
                container.image = image;
            }
        });
    });
}
function extractImageName(imageName) {
    let img = '';
    if (imageName.indexOf('/') > 0) {
        const registry = imageName.substring(0, imageName.indexOf('/'));
        const imgName = imageName.substring(imageName.indexOf('/') + 1).split(':')[0];
        img = `${registry}/${imgName}`;
    }
    else {
        img = imageName.split(':')[0];
    }
    return img;
}
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
