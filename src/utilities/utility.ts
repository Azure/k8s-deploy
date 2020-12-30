import * as os from 'os';
import * as core from '@actions/core';
import { IExecSyncResult } from './tool-runner';
import { Kubectl } from '../kubectl-object-model';
import { GitHubClient } from '../githubClient';
import { StatusCodes } from "./httpClient";
import * as inputParams from "../input-parameters";
import { DockerExec } from '../docker-object-model';
import * as io from '@actions/io';

export interface DeploymentConfig {
    manifestFilePaths: string[];
    helmChartFilePaths: string[];
    dockerfilePaths: any;
}

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

export function getLastSuccessfulRunSha(kubectl: Kubectl, namespaceName: string, annotationKey: string): string {
    try {
        const result = kubectl.getResource('namespace', namespaceName);
        if (result) {
            if (result.stderr) {
                core.warning(`${result.stderr}`);
                return process.env.GITHUB_SHA;
            }
            else if (result.stdout) {
                const annotationsSet = JSON.parse(result.stdout).metadata.annotations;
                if (annotationsSet && annotationsSet[annotationKey]) {
                    return JSON.parse(annotationsSet[annotationKey].replace(/'/g, '"')).commit;
                }
                else {
                    return 'NA';
                }
            }
        }
    }
    catch (ex) {
        core.warning(`Failed to get commits from cluster. ${JSON.stringify(ex)}`);
        return '';
    }
}

export async function getWorkflowFilePath(githubToken: string): Promise<string> {
    let workflowFilePath = process.env.GITHUB_WORKFLOW;
    if (!workflowFilePath.startsWith('.github/workflows/')) {
        const githubClient = new GitHubClient(process.env.GITHUB_REPOSITORY, githubToken);
        const response = await githubClient.getWorkflows();
        if (response) {
            if (response.statusCode == StatusCodes.OK
                && response.body
                && response.body.total_count) {
                if (response.body.total_count > 0) {
                    for (let workflow of response.body.workflows) {
                        if (process.env.GITHUB_WORKFLOW === workflow.name) {
                            workflowFilePath = workflow.path;
                            break;
                        }
                    }
                }
            }
            else if (response.statusCode != StatusCodes.OK) {
                core.debug(`An error occured while getting list of workflows on the repo. Statuscode: ${response.statusCode}, StatusMessage: ${response.statusMessage}`);
            }
        }
        else {
            core.warning(`Failed to get response from workflow list API`);
        }
    }
    return Promise.resolve(workflowFilePath);
}

export function annotateChildPods(kubectl: Kubectl, resourceType: string, resourceName: string, annotationKeyValStr: string, allPods): IExecSyncResult[] {
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
                        commandExecutionResults.push(kubectl.annotate('pod', pod.metadata.name, annotationKeyValStr));
                    }
                });
            }
        });
    }
    return commandExecutionResults;
}

export async function getDeploymentConfig(): Promise<DeploymentConfig> {

    const inputManifestFiles = inputParams.manifests || [];
    const helmChartPaths = (process.env.HELM_CHART_PATHS && process.env.HELM_CHART_PATHS.split('\n').filter(path => path != "")) || [];
    const imageNames = inputParams.containers || [];
    let imageDockerfilePathMap: { [id: string]: string; } = {};

    //Fetching from image label if available
    for (const image of imageNames) {
        let imageConfig: any, imageInspectResult: string;

        try {
            await checkDockerPath();
            var dockerExec: DockerExec = new DockerExec('docker');
            dockerExec.pull(image, [], true);
            imageInspectResult = dockerExec.inspect(image, [], true);
            imageConfig = JSON.parse(imageInspectResult)[0];
            imageDockerfilePathMap[image] = getDockerfilePath(imageConfig);
        }
        catch (ex) {
            core.warning(`Failed to get dockerfile path for image ${image.toString()} | ` + ex);
        }
    }

    const deploymentConfig = <DeploymentConfig>{
        manifestFilePaths: inputManifestFiles,
        helmChartFilePaths: helmChartPaths,
        dockerfilePaths: imageDockerfilePathMap
    };

    return Promise.resolve(deploymentConfig);
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

async function checkDockerPath() {
    let dockerPath = await io.which('docker', false);
    if (!dockerPath) {
        throw new Error('Docker is not installed.');
    }
}

function getDockerfilePath(imageConfig: any): string {
    const DOCKERFILE_PATH_LABEL_KEY = 'dockerfile-path';
    const ref: string = process.env.GITHUB_REF && process.env.GITHUB_REF.replace('refs/heads/', '').replace('refs/tags/', '');
    let pathLink: string, pathValue: string = '';
    if (imageConfig) {
        if ((imageConfig.Config) && (imageConfig.Config.Labels) && (imageConfig.Config.Labels[DOCKERFILE_PATH_LABEL_KEY])) {
            const pathLabel = imageConfig.Config.Labels[DOCKERFILE_PATH_LABEL_KEY];
            if (pathLabel.startsWith('./')) {  //if it is relative filepath convert to link from current repo
                pathLink = `https://github.com/${process.env.GITHUB_REPOSITORY}/blob/${ref}/${pathLabel}`;
                pathValue = pathLink;
            }
            else {
                pathValue = pathLabel;
            }
        }
        else {
            pathValue = '';
        }
    }
    return pathValue;
}

