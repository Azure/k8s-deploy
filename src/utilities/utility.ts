import * as os from 'os';
import * as core from '@actions/core';
import { IExecSyncResult } from './tool-runner';
import { Kubectl } from '../kubectl-object-model';
import { GitHubClient } from '../githubClient';
import { StatusCodes } from "./httpClient";

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

    if (!!ignoreCase) {
        return str1.toUpperCase() === str2.toUpperCase();
    } else {
        return str1 === str2;
    }
}

export function checkForErrors(execResults: IExecSyncResult[], warnIfError?: boolean) {
    if (execResults.length !== 0) {
        let stderr = '';
        execResults.forEach(result => {
            if (!!result && !!result.stderr) {
                if (result.code !== 0) {
                    stderr += result.stderr + '\n';
                } else {
                    core.warning(result.stderr);
                }
            }
        });
        if (stderr.length > 0) {
            if (!!warnIfError) {
                core.warning(stderr.trim());
            } else {
                throw new Error(stderr.trim());
            }
        }
    }
}

export async function getLastSuccessfulRunSha(githubToken: string): Promise<string> {
    let lastSuccessRunSha = '';
    const gitHubClient = new GitHubClient(process.env.GITHUB_REPOSITORY, githubToken);
    const branch = process.env.GITHUB_REF.replace("refs/heads/", "");
    const response = await gitHubClient.getSuccessfulRunsOnBranch(branch);
    if (response.statusCode == StatusCodes.OK
        && response.body
        && response.body.total_count) {
        if (response.body.total_count > 0) {
            lastSuccessRunSha = response.body.workflow_runs[0].head_sha;
        }
        else {
            lastSuccessRunSha = 'NA';
        }
    }
    else if (response.statusCode != StatusCodes.OK) {
        core.debug(`An error occured while getting succeessful run results. Statuscode: ${response.statusCode}, StatusMessage: ${response.statusMessage}`);
    }
    return lastSuccessRunSha;
}

export function annotateChildPods(kubectl: Kubectl, resourceType: string, resourceName: string, annotationKeyValStr: string, allPods): IExecSyncResult[] {
    const commandExecutionResults = [];
    let owner = resourceName;
    if (resourceType.toLowerCase().indexOf('deployment') > -1) {
        owner = kubectl.getNewReplicaSet(resourceName);
    }

    if (!!allPods && !!allPods.items && allPods.items.length > 0) {
        allPods.items.forEach((pod) => {
            const owners = pod.metadata.ownerReferences;
            if (!!owners) {
                owners.forEach(ownerRef => {
                    if (ownerRef.name === owner) {
                        commandExecutionResults.push(kubectl.annotate('pod', pod.metadata.name, [annotationKeyValStr], true));
                    }
                });
            }
        });
    }
    return commandExecutionResults;
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
