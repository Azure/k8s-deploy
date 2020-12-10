import * as os from 'os';
import * as core from '@actions/core';
import { IExecSyncResult } from './tool-runner';
import { Kubectl } from '../kubectl-object-model';
import { GitHubClient } from '../githubClient';
import { StatusCodes } from "./httpClient";
import * as exec from "./exec";
import * as inputParams from "../input-parameters";

export interface FileConfigPath {
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
                for (let ownerRef of owners) {
                    if (ownerRef.name === owner) {
                        commandExecutionResults.push(kubectl.annotate('pod', pod.metadata.name, annotationKeyValStr));
                        break;
                    }
                }
            }
        });
    }

    return commandExecutionResults;
}

export async function getFilePathsConfigs(): Promise<FileConfigPath> {

    let filePathsConfig = <FileConfigPath>{};
    const MANIFEST_PATHS_KEY = 'manifestFilePaths';
    const HELM_CHART_KEY = 'helmChartFilePaths';
    const DOCKERFILE_PATH_KEY = 'dockerfilePaths';
    const DOCKERFILE_PATH_LABEL_KEY = 'dockerfile-path';

    let inputManifestFiles = inputParams.manifests || [];
    filePathsConfig[MANIFEST_PATHS_KEY] = inputManifestFiles;

    let helmChartPaths = (process.env.HELM_CHART_PATHS && process.env.HELM_CHART_PATHS.split('\n').filter(path => path != "")) || [];
    filePathsConfig[HELM_CHART_KEY] = helmChartPaths;

    //Parsing dockerfile paths for images
    let imageNames = core.getInput('images').split('\n');
    let imageDockerfilePathMap: any = {};
    let registryCredentialsMap: any = {};
    let pathKey: string, pathValue: string, registryName: string, username: string, password: string;

    //Fetching from environment variables if available :: List of image_name<space>dockerfile_path
    let dockerfilePathsList: any[] = (process.env.DOCKERFILE_PATHS && process.env.DOCKERFILE_PATHS.split('\n')) || [];
    dockerfilePathsList.forEach(path => {
        if (path) {
            pathKey = path.split(' ')[0];
            pathValue = path.split(' ')[1];
            imageDockerfilePathMap[pathKey] = pathValue;
        }
    })

    //Fetching list of registry username and password from environment variables :: List of registry_name<space>username<space>password
    let credentialList: string[] = (process.env.REGISTRY_CREDENTIALS && process.env.REGISTRY_CREDENTIALS.split('\n')) || [];
    credentialList.forEach(credential => {
        if (credential) {
            registryName = credential.split(' ')[0];
            username = credential.split(' ')[1];
            password = credential.split(' ')[2];
            registryCredentialsMap[registryName] = [ username, password ];
        }
    })

    //Fetching from image label if available
    for (const image of imageNames) {
        let args: string[] = [image];
        let imageConfig: any;
        let containerRegistryName = image.split('/')[0];

        try {
            if (registryCredentialsMap && registryCredentialsMap[containerRegistryName]) {
                let registryUsername = registryCredentialsMap[containerRegistryName][0] || null;
                let registryPassword = registryCredentialsMap[containerRegistryName][1] || null;
                if (registryPassword && registryUsername) {
                    let loginArgs: string[] = [containerRegistryName, '--username', registryUsername, '--password', registryPassword];
                    await exec.exec('docker login ', loginArgs, false).then(res => {
                        if (res.stderr != '' && !res.success) {
                            core.warning(`docker login failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
                        }
                    });
                }
                else{
                    core.warning(`docker login failed due to incomplete credentials`);
                }
            }
            else{
                core.warning(`docker login failed due to no credentials`);
            }

            await exec.exec('docker pull ', args, true).then(res => {
                if (res.stderr != '' && !res.success) {
                    throw new Error(`docker images pull failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
                }
            });

            await exec.exec('docker inspect --type=image', args, true).then(res => {
                if (res.stderr != '' && !res.success) {
                    throw new Error(`docker inspect call failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
                }

                if (res.stdout) {
                    imageConfig = JSON.parse(res.stdout);
                }
            });
        }
        catch (ex) {
            core.warning(`Failed to get dockerfile paths for image ${image.toString()} | ` + ex);
        }

        if (imageConfig) {
            imageConfig = imageConfig[0];
            if ((imageConfig.Config) && (imageConfig.Config.Labels) && (imageConfig.Config.Labels[DOCKERFILE_PATH_LABEL_KEY])) {
                pathValue = imageConfig.Config.Labels[DOCKERFILE_PATH_LABEL_KEY];
            }
            else {
                pathValue = 'Not available';
            }
            if (!imageDockerfilePathMap[image]) { //If (image : someVal) does not exist from env var parsing then add
                imageDockerfilePathMap[image] = pathValue;
            }
        }
    }

    filePathsConfig[DOCKERFILE_PATH_KEY] = imageDockerfilePathMap;

    return Promise.resolve(filePathsConfig);
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
