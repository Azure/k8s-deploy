import * as core from '@actions/core';
import { isEqual } from "./utils";

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

export function updateContainerImagesInManifestFiles(contents, containers: string[]): string {
    if (!!containers && containers.length > 0) {
        containers.forEach((container: string) => {
            let imageName = container;
            if (imageName.indexOf(':') > 0) {
                imageName = imageName.substring(0, imageName.lastIndexOf(':'));
            }
            if (imageName.indexOf('@') > 0) {
                imageName = imageName.split('@')[0];
            }
            if (contents.indexOf(imageName) > 0) {
                contents = substituteImageNameInSpecContent(contents, imageName, container);
            }
        });

    }

    return contents;
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
