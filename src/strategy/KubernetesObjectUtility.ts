'use strict';
import * as fs from 'fs';
import * as core from '@actions/core';
import * as yaml from 'js-yaml';
import { Resource } from '../kubectl-object-model';
import { KubernetesWorkload, deploymentTypes, workloadTypes } from '../kubernetesconstants';
import { StringComparer, isEqual } from './StringComparison';

export function isDeploymentEntity(kind: string): boolean {
    if (!kind) {
        throw ('ResourceKindNotDefined');
    }

    return deploymentTypes.some((type: string) => {
        return isEqual(type, kind, StringComparer.OrdinalIgnoreCase);
    });
}

export function isWorkloadEntity(kind: string): boolean {
    if (!kind) {
        throw ('ResourceKindNotDefined');
    }

    return workloadTypes.some((type: string) => {
        return isEqual(type, kind, StringComparer.OrdinalIgnoreCase);
    });
}

export function isServiceEntity(kind: string): boolean {
    if (!kind) {
        throw ('ResourceKindNotDefined');
    }

    return isEqual("Service", kind, StringComparer.OrdinalIgnoreCase);
}

export function getReplicaCount(inputObject: any): any {
    if (!inputObject) {
        throw ('NullInputObject');
    }

    if (!inputObject.kind) {
        throw ('ResourceKindNotDefined');
    }

    const kind = inputObject.kind;
    if (!isEqual(kind, KubernetesWorkload.pod, StringComparer.OrdinalIgnoreCase) && !isEqual(kind, KubernetesWorkload.daemonSet, StringComparer.OrdinalIgnoreCase)) {
        return inputObject.spec.replicas;
    }

    return 0;
}

export function updateObjectLabels(inputObject: any, newLabels: Map<string, string>, override: boolean) {

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
    } else {
        let existingLabels = inputObject.metadata.labels;
        if (!existingLabels) {
            existingLabels = new Map<string, string>();
        }

        Object.keys(newLabels).forEach(function (key) {
            existingLabels[key] = newLabels[key];
        });

        inputObject.metadata.labels = existingLabels;
    }
}

export function updateImagePullSecrets(inputObject: any, newImagePullSecrets: string[], override: boolean) {
    if (!inputObject || !inputObject.spec || !newImagePullSecrets) {
        return;
    }

    const newImagePullSecretsObjects = Array.from(newImagePullSecrets, x => { return { 'name': x }; });
    let existingImagePullSecretObjects: any = getImagePullSecrets(inputObject);

    if (override) {
        existingImagePullSecretObjects = newImagePullSecretsObjects;
    } else {
        if (!existingImagePullSecretObjects) {
            existingImagePullSecretObjects = new Array();
        }

        existingImagePullSecretObjects = existingImagePullSecretObjects.concat(newImagePullSecretsObjects);
    }

    setImagePullSecrets(inputObject, existingImagePullSecretObjects);
}

export function updateSpecLabels(inputObject: any, newLabels: Map<string, string>, override: boolean) {
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
    } else {
        if (!existingLabels) {
            existingLabels = new Map<string, string>();
        }

        Object.keys(newLabels).forEach(function (key) {
            existingLabels[key] = newLabels[key];
        });
    }

    setSpecLabels(inputObject, existingLabels);
}

export function updateSelectorLabels(inputObject: any, newLabels: Map<string, string>, override: boolean) {
    if (!inputObject) {
        throw ('NullInputObject');
    }

    if (!inputObject.kind) {
        throw ('ResourceKindNotDefined');
    }

    if (!newLabels) {
        return;
    }

    if (isEqual(inputObject.kind, KubernetesWorkload.pod, StringComparer.OrdinalIgnoreCase)) {
        return;
    }

    let existingLabels = getSpecSelectorLabels(inputObject);

    if (override) {
        existingLabels = newLabels;
    } else {
        if (!existingLabels) {
            existingLabels = new Map<string, string>();
        }

        Object.keys(newLabels).forEach(function (key) {
            existingLabels[key] = newLabels[key];
        });
    }

    setSpecSelectorLabels(inputObject, existingLabels);
}

export function getResources(filePaths: string[], filterResourceTypes: string[]): Resource[] {
    if (!filePaths) {
        return [];
    }

    const resources: Resource[] = [];

    filePaths.forEach((filePath: string) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const inputObjectKind = inputObject ? inputObject.kind : '';
            if (filterResourceTypes.filter(type => isEqual(inputObjectKind, type, StringComparer.OrdinalIgnoreCase)).length > 0) {
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

function getSpecLabels(inputObject: any) {

    if (!inputObject) {
        return null;
    }

    if (isEqual(inputObject.kind, KubernetesWorkload.pod, StringComparer.OrdinalIgnoreCase)) {
        return inputObject.metadata.labels;
    }
    if (!!inputObject.spec && !!inputObject.spec.template && !!inputObject.spec.template.metadata) {
        return inputObject.spec.template.metadata.labels;
    }

    return null;
}

function getImagePullSecrets(inputObject: any) {

    if (!inputObject || !inputObject.spec) {
        return null;
    }

    if (isEqual(inputObject.kind, KubernetesWorkload.cronjob, StringComparer.OrdinalIgnoreCase)) {
        try {
            return inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets;
        } catch (ex) {
            core.debug(`Fetching imagePullSecrets failed due to this error: ${JSON.stringify(ex)}`);
            return null;
        }
    }

    if (isEqual(inputObject.kind, KubernetesWorkload.pod, StringComparer.OrdinalIgnoreCase)) {
        return inputObject.spec.imagePullSecrets;
    }

    if (!!inputObject.spec.template && !!inputObject.spec.template.spec) {
        return inputObject.spec.template.spec.imagePullSecrets;
    }

    return null;
}

function setImagePullSecrets(inputObject: any, newImagePullSecrets: any) {
    if (!inputObject || !inputObject.spec || !newImagePullSecrets) {
        return;
    }

    if (isEqual(inputObject.kind, KubernetesWorkload.pod, StringComparer.OrdinalIgnoreCase)) {
        inputObject.spec.imagePullSecrets = newImagePullSecrets;
        return;
    }

    if (isEqual(inputObject.kind, KubernetesWorkload.cronjob, StringComparer.OrdinalIgnoreCase)) {
        try {
            inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets = newImagePullSecrets;
        } catch (ex) {
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

function setSpecLabels(inputObject: any, newLabels: any) {
    let specLabels = getSpecLabels(inputObject);
    if (!!newLabels) {
        specLabels = newLabels;
    }
}

function getSpecSelectorLabels(inputObject: any) {

    if (!!inputObject && !!inputObject.spec && !!inputObject.spec.selector) {
        if (isServiceEntity(inputObject.kind)) {
            return inputObject.spec.selector;
        } else {
            return inputObject.spec.selector.matchLabels;
        }
    }

    return null;
}

function setSpecSelectorLabels(inputObject: any, newLabels: any) {

    let selectorLabels = getSpecSelectorLabels(inputObject);
    if (!!selectorLabels) {
        selectorLabels = newLabels;
    }
}