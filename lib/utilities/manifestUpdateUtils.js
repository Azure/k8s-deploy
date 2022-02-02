"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResources = exports.updateSelectorLabels = exports.updateImagePullSecrets = exports.updateObjectAnnotations = exports.updateObjectLabels = exports.getReplicaCount = exports.substituteImageNameInSpecFile = exports.UnsetClusterSpecificDetails = exports.updateManifestFiles = void 0;
const core = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");
const fileHelper = require("./fileUtils");
const fileUtils_1 = require("./fileUtils");
const kubernetesTypes_1 = require("../types/kubernetesTypes");
const manifestSpecLabelUtils_1 = require("./manifestSpecLabelUtils");
const manifestPullSecretUtils_1 = require("./manifestPullSecretUtils");
function updateManifestFiles(manifestFilePaths) {
    if ((manifestFilePaths === null || manifestFilePaths === void 0 ? void 0 : manifestFilePaths.length) === 0) {
        throw new Error("Manifest files not provided");
    }
    // update container images
    const containers = core.getInput("images").split("\n");
    const manifestFiles = updateContainerImagesInManifestFiles(manifestFilePaths, containers);
    // update pull secrets
    const imagePullSecrets = core
        .getInput("imagepullsecrets")
        .split("\n")
        .filter((secret) => secret.trim().length > 0);
    return updateImagePullSecretsInManifestFiles(manifestFiles, imagePullSecrets);
}
exports.updateManifestFiles = updateManifestFiles;
function UnsetClusterSpecificDetails(resource) {
    if (!resource) {
        return;
    }
    // Unset cluster specific details in the object
    if (!!resource) {
        const { metadata, status } = resource;
        if (!!metadata) {
            resource.metadata = {
                annotations: metadata.annotations,
                labels: metadata.labels,
                name: metadata.name,
            };
        }
        if (!!status) {
            resource.status = {};
        }
    }
}
exports.UnsetClusterSpecificDetails = UnsetClusterSpecificDetails;
function updateContainerImagesInManifestFiles(filePaths, containers) {
    if ((filePaths === null || filePaths === void 0 ? void 0 : filePaths.length) <= 0)
        return filePaths;
    const newFilePaths = [];
    // update container images
    filePaths.forEach((filePath) => {
        let contents = fs.readFileSync(filePath).toString();
        containers.forEach((container) => {
            let [imageName] = container.split(":");
            if (imageName.indexOf("@") > 0) {
                imageName = imageName.split("@")[0];
            }
            if (contents.indexOf(imageName) > 0)
                contents = substituteImageNameInSpecFile(contents, imageName, container);
        });
        // write updated files
        const tempDirectory = (0, fileUtils_1.getTempDirectory)();
        const fileName = path.join(tempDirectory, path.basename(filePath));
        fs.writeFileSync(path.join(fileName), contents);
        newFilePaths.push(fileName);
    });
    return newFilePaths;
}
/*
  Example:

  Input of
    currentString: `image: "example/example-image"`
    imageName: `example/example-image`
    imageNameWithNewTag: `example/example-image:identifiertag`

  would return
    `image: "example/example-image:identifiertag"`
*/
function substituteImageNameInSpecFile(spec, imageName, imageNameWithNewTag) {
    if (spec.indexOf(imageName) < 0)
        return spec;
    return spec.split("\n").reduce((acc, line) => {
        const imageKeyword = line.match(/^ *image:/);
        if (imageKeyword) {
            let [currentImageName] = line
                .substring(imageKeyword[0].length) // consume the line from keyword onwards
                .trim()
                .replace(/[',"]/g, "") // replace allowed quotes with nothing
                .split(":");
            if ((currentImageName === null || currentImageName === void 0 ? void 0 : currentImageName.indexOf(" ")) > 0) {
                currentImageName = currentImageName.split(" ")[0]; // remove comments
            }
            if (currentImageName === imageName) {
                return acc + `${imageKeyword[0]} ${imageNameWithNewTag}\n`;
            }
        }
        return acc + line + "\n";
    }, "");
}
exports.substituteImageNameInSpecFile = substituteImageNameInSpecFile;
function getReplicaCount(inputObject) {
    if (!inputObject)
        throw kubernetesTypes_1.NullInputObjectError;
    if (!inputObject.kind) {
        throw kubernetesTypes_1.InputObjectKindNotDefinedError;
    }
    const { kind } = inputObject;
    if (kind.toLowerCase() !== kubernetesTypes_1.KubernetesWorkload.POD.toLowerCase() &&
        kind.toLowerCase() !== kubernetesTypes_1.KubernetesWorkload.DAEMON_SET.toLowerCase())
        return inputObject.spec.replicas;
    return 0;
}
exports.getReplicaCount = getReplicaCount;
function updateObjectLabels(inputObject, newLabels, override = false) {
    if (!inputObject)
        throw kubernetesTypes_1.NullInputObjectError;
    if (!inputObject.metadata)
        throw kubernetesTypes_1.InputObjectMetadataNotDefinedError;
    if (!newLabels)
        return;
    if (override) {
        inputObject.metadata.labels = newLabels;
    }
    else {
        let existingLabels = inputObject.metadata.labels || new Map();
        Object.keys(newLabels).forEach((key) => (existingLabels[key] = newLabels[key]));
        inputObject.metadata.labels = existingLabels;
    }
}
exports.updateObjectLabels = updateObjectLabels;
function updateObjectAnnotations(inputObject, newAnnotations, override = false) {
    if (!inputObject)
        throw kubernetesTypes_1.NullInputObjectError;
    if (!inputObject.metadata)
        throw kubernetesTypes_1.InputObjectMetadataNotDefinedError;
    if (!newAnnotations)
        return;
    if (override) {
        inputObject.metadata.annotations = newAnnotations;
    }
    else {
        const existingAnnotations = inputObject.metadata.annotations || new Map();
        Object.keys(newAnnotations).forEach((key) => (existingAnnotations[key] = newAnnotations[key]));
        inputObject.metadata.annotations = existingAnnotations;
    }
}
exports.updateObjectAnnotations = updateObjectAnnotations;
function updateImagePullSecrets(inputObject, newImagePullSecrets, override = false) {
    if (!(inputObject === null || inputObject === void 0 ? void 0 : inputObject.spec) || !newImagePullSecrets)
        return;
    const newImagePullSecretsObjects = Array.from(newImagePullSecrets, (name) => {
        return { name };
    });
    let existingImagePullSecretObjects = (0, manifestPullSecretUtils_1.getImagePullSecrets)(inputObject);
    if (override) {
        existingImagePullSecretObjects = newImagePullSecretsObjects;
    }
    else {
        existingImagePullSecretObjects = existingImagePullSecretObjects || [];
        existingImagePullSecretObjects = existingImagePullSecretObjects.concat(newImagePullSecretsObjects);
    }
    (0, manifestPullSecretUtils_1.setImagePullSecrets)(inputObject, existingImagePullSecretObjects);
}
exports.updateImagePullSecrets = updateImagePullSecrets;
function updateSelectorLabels(inputObject, newLabels, override) {
    if (!inputObject)
        throw kubernetesTypes_1.NullInputObjectError;
    if (!inputObject.kind)
        throw kubernetesTypes_1.InputObjectKindNotDefinedError;
    if (!newLabels)
        return;
    if (inputObject.kind.toLowerCase() === kubernetesTypes_1.KubernetesWorkload.POD.toLowerCase())
        return;
    let existingLabels = (0, manifestSpecLabelUtils_1.getSpecSelectorLabels)(inputObject);
    if (override) {
        existingLabels = newLabels;
    }
    else {
        existingLabels = existingLabels || new Map();
        Object.keys(newLabels).forEach((key) => (existingLabels[key] = newLabels[key]));
    }
    (0, manifestSpecLabelUtils_1.setSpecSelectorLabels)(inputObject, existingLabels);
}
exports.updateSelectorLabels = updateSelectorLabels;
function getResources(filePaths, filterResourceTypes) {
    if (!filePaths)
        return [];
    const resources = [];
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath).toString();
        yaml.safeLoadAll(fileContents, (inputObject) => {
            const inputObjectKind = (inputObject === null || inputObject === void 0 ? void 0 : inputObject.kind) || "";
            if (filterResourceTypes.filter((type) => inputObjectKind.toLowerCase() === type.toLowerCase()).length > 0) {
                resources.push({
                    type: inputObject.kind,
                    name: inputObject.metadata.name,
                });
            }
        });
    });
    return resources;
}
exports.getResources = getResources;
function updateImagePullSecretsInManifestFiles(filePaths, imagePullSecrets) {
    if ((imagePullSecrets === null || imagePullSecrets === void 0 ? void 0 : imagePullSecrets.length) <= 0)
        return filePaths;
    const newObjectsList = [];
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath).toString();
        yaml.safeLoadAll(fileContents, (inputObject) => {
            if (inputObject === null || inputObject === void 0 ? void 0 : inputObject.kind) {
                const { kind } = inputObject;
                if ((0, kubernetesTypes_1.isWorkloadEntity)(kind)) {
                    updateImagePullSecrets(inputObject, imagePullSecrets);
                }
                newObjectsList.push(inputObject);
            }
        });
    });
    return fileHelper.writeObjectsToFile(newObjectsList);
}
