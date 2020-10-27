import * as os from 'os';
import * as core from '@actions/core';
import * as glob from 'glob';
import { IExecSyncResult } from './tool-runner';
import { Kubectl } from '../kubectl-object-model';
import { workflowAnnotations } from '../constants';

export function getExecutableExtension(): string {
    if (os.type().match(/^Win/)) {
        return '.exe';
    }

    return '';
}

export function isEqual(str1: string, str2: string, ignoreCase?: boolean): boolean {
    if (str1 == null && str2 == null) {
        return true;
    }

    if (str1 == null || str2 == null) {
        return false;
    }

    if (ignoreCase) {
        return str1.toUpperCase() === str2.toUpperCase();
    } else {
        return str1 === str2;
    }
}

export function checkForErrors(execResults: IExecSyncResult[], warnIfError?: boolean) {
    if (execResults.length !== 0) {
        let stderr = '';
        execResults.forEach(result => {
            if (result && result.stderr) {
                if (result.code !== 0) {
                    stderr += result.stderr + '\n';
                } else {
                    core.warning(result.stderr);
                }
            }
        });
        if (stderr.length > 0) {
            if (warnIfError) {
                core.warning(stderr.trim());
            } else {
                throw new Error(stderr.trim());
            }
        }
    }
}

export function annotateChildPods(kubectl: Kubectl, resourceType: string, resourceName: string, allPods): IExecSyncResult[] {
    const commandExecutionResults = [];
    let owner = resourceName;
    if (resourceType.toLowerCase().indexOf('deployment') > -1) {
        owner = kubectl.getNewReplicaSet(resourceName);
    }

    if (allPods && allPods.items && allPods.items.length > 0) {
        allPods.items.forEach((pod) => {
            const owners = pod.metadata.ownerReferences;
            if (owners) {
                owners.forEach(ownerRef => {
                    if (ownerRef.name === owner) {
                        commandExecutionResults.push(kubectl.annotate('pod', pod.metadata.name, workflowAnnotations, true));
                    }
                });
            }
        });
    }

    return commandExecutionResults;
}

export function annotateNamespace(kubectl: Kubectl, namespaceName: string): IExecSyncResult {
    const result = kubectl.getResource('namespace', namespaceName);
    if (!result) {
        return { code: -1, stderr: 'Failed to get resource' } as IExecSyncResult;
    }
    else if (result && result.stderr) {
        return result;
    }

    if (result && result.stdout) {
        const annotationsSet = JSON.parse(result.stdout).metadata.annotations;
        if (annotationsSet && annotationsSet.runUri) {
            if (annotationsSet.runUri.indexOf(process.env['GITHUB_REPOSITORY']) == -1) {
                core.debug(`Skipping 'annotate namespace' as namespace annotated by other workflow`);
                return { code: 0, stdout: '' } as IExecSyncResult;
            }
        }
        return kubectl.annotate('namespace', namespaceName, workflowAnnotations, true);
    }
}

export function sleep(timeout: number) {
    return new Promise(resolve => setTimeout(resolve, timeout));
}

export function getRandomInt(max: number) {
    return Math.floor(Math.random() * Math.floor(max));
}

export function getCurrentTime(): number {
    return new Date().getTime();
}

export function resolveGlobPatterns(manifests: string): string[] {
    if (!manifests) {
        core.setFailed('No manifests supplied to deploy');
        return;
    }
    let unresolvedManifests = manifests.split('\n');
    let resolvedManifests: string[] = [];
    unresolvedManifests.forEach((manifestPath) => {
        if (glob.hasMagic(manifestPath))
            resolvedManifests = resolvedManifests.concat(glob.sync(manifestPath));
        else
            resolvedManifests.push(manifestPath);
    });
    
    if (resolvedManifests == null || resolvedManifests.length == 0) {
        core.setFailed('No manifests supplied to deploy');
        return;
    }
    return resolvedManifests;
}