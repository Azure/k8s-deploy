'use strict';

import * as core from '@actions/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as kubectlutility from './kubectl-util';
import * as io from '@actions/io';
import { isEqual } from "./utility";
import * as fileHelper from './files-helper';
import * as KubernetesObjectUtility from './resource-object-utility';
import * as TaskInputParameters from '../input-parameters';

export function getManifestFiles(manifestFilePaths: string[]): string[] {
    if (!manifestFilePaths) {
        core.debug('file input is not present');
        return null;
    }

    return manifestFilePaths;
}

export async function getKubectl(): Promise<string> {
    try {
        return Promise.resolve(io.which('kubectl', true));
    } catch (ex) {
        return kubectlutility.downloadKubectl(await kubectlutility.getStableKubectlVersion());
    }
}

export function createKubectlArgs(kinds: Set<string>, names: Set<string>): string {
    let args = '';
    if (!!kinds && kinds.size > 0) {
        args = args + createInlineArray(Array.from(kinds.values()));
    }

    if (!!names && names.size > 0) {
        args = args + ' ' + Array.from(names.values()).join(' ');
    }

    return args;
}

export function getDeleteCmdArgs(argsPrefix: string, inputArgs: string): string {
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

/*
    For example,
        currentString: `image: "example/example-image"`
        imageName: `example/example-image`
        imageNameWithNewTag: `example/example-image:identifiertag`

    This substituteImageNameInSpecFile function would return
        return Value: `image: "example/example-image:identifiertag"`
*/

export function substituteImageNameInSpecFile(currentString: string, imageName: string, imageNameWithNewTag: string) {
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

export function getManifestObjects(paths: string[]): any[] {
    let manifestContents = [];
    if (paths.length > 0) {
        paths.forEach((path) => {
            let contents = fileHelper.getManifestFileContents(path);
            if (contents &&
                contents.length > 0) {
                manifestContents.push(contents);
            }
        });
    }
    return manifestContents;
}

function createInlineArray(str: string | string[]): string {
    if (typeof str === 'string') { return str; }
    return str.join(',');
}

function getImagePullSecrets(inputObject: any) {
    if (!inputObject || !inputObject.spec) {
        return;
    }

    if (isEqual(inputObject.kind, 'pod')
        && inputObject
        && inputObject.spec
        && inputObject.spec.imagePullSecrets) {

        return inputObject.spec.imagePullSecrets;
    } else if (isEqual(inputObject.kind, 'cronjob')
        && inputObject
        && inputObject.spec
        && inputObject.spec.jobTemplate
        && inputObject.spec.jobTemplate.spec
        && inputObject.spec.jobTemplate.spec.template
        && inputObject.spec.jobTemplate.spec.template.spec
        && inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets) {

        return inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets;
    } else if (inputObject
        && inputObject.spec
        && inputObject.spec.template
        && inputObject.spec.template.spec
        && inputObject.spec.template.spec.imagePullSecrets) {

        return inputObject.spec.template.spec.imagePullSecrets;
    }
}

function setImagePullSecrets(inputObject: any, newImagePullSecrets: any) {
    if (!inputObject || !inputObject.spec || !newImagePullSecrets) {
        return;
    }

    if (isEqual(inputObject.kind, 'pod')) {
        if (inputObject
            && inputObject.spec) {
            if (newImagePullSecrets.length > 0) {
                inputObject.spec.imagePullSecrets = newImagePullSecrets;
            } else {
                delete inputObject.spec.imagePullSecrets;
            }
        }
    } else if (isEqual(inputObject.kind, 'cronjob')) {
        if (inputObject
            && inputObject.spec
            && inputObject.spec.jobTemplate
            && inputObject.spec.jobTemplate.spec
            && inputObject.spec.jobTemplate.spec.template
            && inputObject.spec.jobTemplate.spec.template.spec) {
            if (newImagePullSecrets.length > 0) {
                inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets = newImagePullSecrets;
            } else {
                delete inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets;
            }
        }
    } else if (!!inputObject.spec.template && !!inputObject.spec.template.spec) {
        if (inputObject
            && inputObject.spec
            && inputObject.spec.template
            && inputObject.spec.template.spec) {
            if (newImagePullSecrets.length > 0) {
                inputObject.spec.template.spec.imagePullSecrets = newImagePullSecrets;
            } else {
                delete inputObject.spec.template.spec.imagePullSecrets;
            }
        }
    }
}

function substituteImageNameInSpecContent(currentString: string, imageName: string, imageNameWithNewTag: string) {
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

function updateContainerImagesInManifestFiles(filePaths: string[], containers: string[]): string[] {
    if (!!containers && containers.length > 0) {
        const newFilePaths = [];
        const tempDirectory = fileHelper.getTempDirectory();
        filePaths.forEach((filePath: string) => {
            let contents = fs.readFileSync(filePath).toString();
            containers.forEach((container: string) => {
                let imageName = container.split(':')[0];
                if (imageName.indexOf('@') > 0) {
                    imageName = imageName.split('@')[0];
                }
                if (contents.indexOf(imageName) > 0) {
                    contents = substituteImageNameInSpecFile(contents, imageName, container);
                }
            });

            const fileName = path.join(tempDirectory, path.basename(filePath));
            fs.writeFileSync(
                path.join(fileName),
                contents
            );
            newFilePaths.push(fileName);
        });

        return newFilePaths;
    }

    return filePaths;
}

export function updateImagePullSecrets(inputObject: any, newImagePullSecrets: string[]) {
    if (!inputObject || !inputObject.spec || !newImagePullSecrets) {
        return;
    }

    let newImagePullSecretsObjects;
    if (newImagePullSecrets.length > 0) {
        newImagePullSecretsObjects = Array.from(newImagePullSecrets, x => { return !!x ? { 'name': x } : null; });
    } else {
        newImagePullSecretsObjects = [];
    }
    let existingImagePullSecretObjects: any = getImagePullSecrets(inputObject);
    if (!existingImagePullSecretObjects) {
        existingImagePullSecretObjects = new Array();
    }

    existingImagePullSecretObjects = existingImagePullSecretObjects.concat(newImagePullSecretsObjects);
    setImagePullSecrets(inputObject, existingImagePullSecretObjects);
}

function updateImagePullSecretsInManifestFiles(filePaths: string[], imagePullSecrets: string[]): string[] {
    if (!!imagePullSecrets && imagePullSecrets.length > 0) {
        const newObjectsList = [];
        filePaths.forEach((filePath: string) => {
            const fileContents = fs.readFileSync(filePath).toString();
            yaml.safeLoadAll(fileContents, function (inputObject: any) {
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

export function getUpdatedManifestFiles (manifestFilePaths: string[]) {
    let inputManifestFiles: string[] = getManifestFiles(manifestFilePaths);

    if (!inputManifestFiles || inputManifestFiles.length === 0) {
        throw new Error(`ManifestFileNotFound : ${manifestFilePaths}`);
    }

    // artifact substitution
    inputManifestFiles = updateContainerImagesInManifestFiles(inputManifestFiles, TaskInputParameters.containers);

    // imagePullSecrets addition
    inputManifestFiles = updateImagePullSecretsInManifestFiles(inputManifestFiles, TaskInputParameters.imagePullSecrets);

    return inputManifestFiles;
}

const workloadTypes: string[] = ['deployment', 'replicaset', 'daemonset', 'pod', 'statefulset', 'job', 'cronjob'];

export function isWorkloadEntity(kind: string): boolean {
    if (!kind) {
        core.debug('ResourceKindNotDefined');
        return false;
    }

    return workloadTypes.some((type: string) => {
        return isEqual(type, kind);
    });
}