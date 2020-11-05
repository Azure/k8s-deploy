'use strict';
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
exports.isWorkloadEntity = exports.getUpdatedManifestFiles = exports.updateImagePullSecrets = exports.substituteImageNameInSpecFile = exports.getDeleteCmdArgs = exports.createKubectlArgs = exports.getKubectl = exports.getManifestFiles = void 0;
const core = require("@actions/core");
const fs = require("fs");
const yaml = require("js-yaml");
const path = require("path");
const kubectlutility = require("./kubectl-util");
const io = require("@actions/io");
const utility_1 = require("./utility");
const fileHelper = require("./files-helper");
const KubernetesObjectUtility = require("./resource-object-utility");
const TaskInputParameters = require("../input-parameters");
function getManifestFiles(manifestFilePaths) {
    if (!manifestFilePaths) {
        core.debug('file input is not present');
        return null;
    }
    return manifestFilePaths;
}
exports.getManifestFiles = getManifestFiles;
function getKubectl() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return Promise.resolve(io.which('kubectl', true));
        }
        catch (ex) {
            return kubectlutility.downloadKubectl(yield kubectlutility.getStableKubectlVersion());
        }
    });
}
exports.getKubectl = getKubectl;
function createKubectlArgs(kinds, names) {
    let args = '';
    if (!!kinds && kinds.size > 0) {
        args = args + createInlineArray(Array.from(kinds.values()));
    }
    if (!!names && names.size > 0) {
        args = args + ' ' + Array.from(names.values()).join(' ');
    }
    return args;
}
exports.createKubectlArgs = createKubectlArgs;
function getDeleteCmdArgs(argsPrefix, inputArgs) {
    let args = '';
    if (!!argsPrefix && argsPrefix.length > 0) {
        args = argsPrefix;
    }
    if (!!inputArgs && inputArgs.length > 0) {
        if (args.length > 0) {
            args = args + ' ';
        }
        args = args + inputArgs;
    }
    return args;
}
exports.getDeleteCmdArgs = getDeleteCmdArgs;
/*
    For example,
        currentString: `image: "example/example-image"`
        imageName: `example/example-image`
        imageNameWithNewTag: `example/example-image:identifiertag`

    This substituteImageNameInSpecFile function would return
        return Value: `image: "example/example-image:identifiertag"`
*/
function substituteImageNameInSpecFile(currentString, imageName, imageNameWithNewTag) {
    if (currentString.indexOf(imageName) < 0) {
        core.debug(`No occurence of replacement token: ${imageName} found`);
        return currentString;
    }
    return currentString.split('\n').reduce((acc, line) => {
        const imageKeyword = line.match(/^ *image:/);
        if (imageKeyword) {
            let [currentImageName, currentImageTag] = line
                .substring(imageKeyword[0].length) // consume the line from keyword onwards
                .trim()
                .replace(/[',"]/g, '') // replace allowed quotes with nothing
                .split(':');
            if (!currentImageTag && currentImageName.indexOf(' ') > 0) {
                currentImageName = currentImageName.split(' ')[0]; // Stripping off comments
            }
            if (currentImageName === imageName) {
                return acc + `${imageKeyword[0]} ${imageNameWithNewTag}\n`;
            }
        }
        return acc + line + '\n';
    }, '');
}
exports.substituteImageNameInSpecFile = substituteImageNameInSpecFile;
function createInlineArray(str) {
    if (typeof str === 'string') {
        return str;
    }
    return str.join(',');
}
function getImagePullSecrets(inputObject) {
    if (!inputObject || !inputObject.spec) {
        return;
    }
    if (utility_1.isEqual(inputObject.kind, 'pod')
        && inputObject
        && inputObject.spec
        && inputObject.spec.imagePullSecrets) {
        return inputObject.spec.imagePullSecrets;
    }
    else if (utility_1.isEqual(inputObject.kind, 'cronjob')
        && inputObject
        && inputObject.spec
        && inputObject.spec.jobTemplate
        && inputObject.spec.jobTemplate.spec
        && inputObject.spec.jobTemplate.spec.template
        && inputObject.spec.jobTemplate.spec.template.spec
        && inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets) {
        return inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets;
    }
    else if (inputObject
        && inputObject.spec
        && inputObject.spec.template
        && inputObject.spec.template.spec
        && inputObject.spec.template.spec.imagePullSecrets) {
        return inputObject.spec.template.spec.imagePullSecrets;
    }
}
function setImagePullSecrets(inputObject, newImagePullSecrets) {
    if (!inputObject || !inputObject.spec || !newImagePullSecrets) {
        return;
    }
    if (utility_1.isEqual(inputObject.kind, 'pod')) {
        if (inputObject
            && inputObject.spec) {
            if (newImagePullSecrets.length > 0) {
                inputObject.spec.imagePullSecrets = newImagePullSecrets;
            }
            else {
                delete inputObject.spec.imagePullSecrets;
            }
        }
    }
    else if (utility_1.isEqual(inputObject.kind, 'cronjob')) {
        if (inputObject
            && inputObject.spec
            && inputObject.spec.jobTemplate
            && inputObject.spec.jobTemplate.spec
            && inputObject.spec.jobTemplate.spec.template
            && inputObject.spec.jobTemplate.spec.template.spec) {
            if (newImagePullSecrets.length > 0) {
                inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets = newImagePullSecrets;
            }
            else {
                delete inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets;
            }
        }
    }
    else if (!!inputObject.spec.template && !!inputObject.spec.template.spec) {
        if (inputObject
            && inputObject.spec
            && inputObject.spec.template
            && inputObject.spec.template.spec) {
            if (newImagePullSecrets.length > 0) {
                inputObject.spec.template.spec.imagePullSecrets = newImagePullSecrets;
            }
            else {
                delete inputObject.spec.template.spec.imagePullSecrets;
            }
        }
    }
}
function substituteImageNameInSpecContent(currentString, imageName, imageNameWithNewTag) {
    if (currentString.indexOf(imageName) < 0) {
        core.debug(`No occurence of replacement token: ${imageName} found`);
        return currentString;
    }
    return currentString.split('\n').reduce((acc, line) => {
        const imageKeyword = line.match(/^ *image:/);
        if (imageKeyword) {
            const [currentImageName, currentImageTag] = line
                .substring(imageKeyword[0].length) // consume the line from keyword onwards
                .trim()
                .replace(/[',"]/g, '') // replace allowed quotes with nothing
                .split(':');
            if (currentImageName === imageName) {
                return acc + `${imageKeyword[0]} ${imageNameWithNewTag}\n`;
            }
        }
        return acc + line + '\n';
    }, '');
}
function updateContainerImagesInManifestFiles(filePaths, containers) {
    if (!!containers && containers.length > 0) {
        const newFilePaths = [];
        const tempDirectory = fileHelper.getTempDirectory();
        filePaths.forEach((filePath) => {
            let contents = fs.readFileSync(filePath).toString();
            containers.forEach((container) => {
                let imageName = container.split(':')[0];
                if (imageName.indexOf('@') > 0) {
                    imageName = imageName.split('@')[0];
                }
                if (contents.indexOf(imageName) > 0) {
                    contents = substituteImageNameInSpecFile(contents, imageName, container);
                }
            });
            const fileName = path.join(tempDirectory, path.basename(filePath));
            fs.writeFileSync(path.join(fileName), contents);
            newFilePaths.push(fileName);
        });
        return newFilePaths;
    }
    return filePaths;
}
function updateImagePullSecrets(inputObject, newImagePullSecrets) {
    if (!inputObject || !inputObject.spec || !newImagePullSecrets) {
        return;
    }
    let newImagePullSecretsObjects;
    if (newImagePullSecrets.length > 0) {
        newImagePullSecretsObjects = Array.from(newImagePullSecrets, x => { return !!x ? { 'name': x } : null; });
    }
    else {
        newImagePullSecretsObjects = [];
    }
    let existingImagePullSecretObjects = getImagePullSecrets(inputObject);
    if (!existingImagePullSecretObjects) {
        existingImagePullSecretObjects = new Array();
    }
    existingImagePullSecretObjects = existingImagePullSecretObjects.concat(newImagePullSecretsObjects);
    setImagePullSecrets(inputObject, existingImagePullSecretObjects);
}
exports.updateImagePullSecrets = updateImagePullSecrets;
function updateImagePullSecretsInManifestFiles(filePaths, imagePullSecrets) {
    if (!!imagePullSecrets && imagePullSecrets.length > 0) {
        const newObjectsList = [];
        filePaths.forEach((filePath) => {
            const fileContents = fs.readFileSync(filePath).toString();
            yaml.safeLoadAll(fileContents, function (inputObject) {
                if (!!inputObject && !!inputObject.kind) {
                    const kind = inputObject.kind;
                    if (KubernetesObjectUtility.isWorkloadEntity(kind)) {
                        KubernetesObjectUtility.updateImagePullSecrets(inputObject, imagePullSecrets, false);
                    }
                    newObjectsList.push(inputObject);
                }
            });
        });
        core.debug('New K8s objects after adding imagePullSecrets are :' + JSON.stringify(newObjectsList));
        const newFilePaths = fileHelper.writeObjectsToFile(newObjectsList);
        return newFilePaths;
    }
    return filePaths;
}
function getUpdatedManifestFiles(manifestFilePaths) {
    let inputManifestFiles = getManifestFiles(manifestFilePaths);
    if (!inputManifestFiles || inputManifestFiles.length === 0) {
        throw new Error(`ManifestFileNotFound : ${manifestFilePaths}`);
    }
    // artifact substitution
    inputManifestFiles = updateContainerImagesInManifestFiles(inputManifestFiles, TaskInputParameters.containers);
    // imagePullSecrets addition
    inputManifestFiles = updateImagePullSecretsInManifestFiles(inputManifestFiles, TaskInputParameters.imagePullSecrets);
    return inputManifestFiles;
}
exports.getUpdatedManifestFiles = getUpdatedManifestFiles;
const workloadTypes = ['deployment', 'replicaset', 'daemonset', 'pod', 'statefulset', 'job', 'cronjob'];
function isWorkloadEntity(kind) {
    if (!kind) {
        core.debug('ResourceKindNotDefined');
        return false;
    }
    return workloadTypes.some((type) => {
        return utility_1.isEqual(type, kind);
    });
}
exports.isWorkloadEntity = isWorkloadEntity;
