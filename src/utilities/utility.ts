import * as os from 'os';
import * as core from '@actions/core';
import { IExecSyncResult } from './tool-runner';
import { Kubectl } from '../kubectl-object-model';
import { GitHubClient } from '../githubClient';
import { StatusCodes } from "./httpClient";
import * as exec from "./exec";
import * as inputParams from "../input-parameters";
import { Z_FILTERED } from 'zlib';

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

export async function getFilePathsConfigs(): Promise<any> {

    let filePathsConfig: any = {};
    const MANIFEST_PATHS_KEY = 'manifestFilePaths';
    const HELM_CHART_KEY = 'helmChartFilePaths';
    const DOCKERFILE_PATH_KEY = 'dockerfilePaths';
    const DOCKERFILE_PATH_LABEL_KEY = 'dockerfile-path';

    let inputManifestFiles = inputParams.manifests || [];
    filePathsConfig[MANIFEST_PATHS_KEY] = inputManifestFiles;

    let helmChartPaths = [];
    if(process.env.HELM_CHART_PATHS){
        helmChartPaths = process.env.HELM_CHART_PATHS.split('\n');
        helmChartPaths.filter( val => val != "" );
    }    
    
    filePathsConfig[HELM_CHART_KEY] = helmChartPaths;

    //Fetch labels from each image
    
    let imageNames = core.getInput('images').split('\n');
    let imageDockerfilePathList: any = [];

    for(const image of imageNames){
        let args: string[] = [image];
        let resultObj: any;
        let containerRegistryName = image;
        let imageDockerfilePathObj: any = {};

        try{
            let usrname = process.env.CR_USERNAME || null;
            let pwd = process.env.CR_PASSWORD || null;
            if(pwd && usrname)
            {
                let loginArgs: string[] = [containerRegistryName, '--username', usrname, '--password', pwd];
                await exec.exec('docker login ', loginArgs, true).then(res => {
                    if (res.stderr != '' && !res.success) {
                        throw new Error(`docker login failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
                    }
                });
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

                if(res.stdout){
                    resultObj = JSON.parse(res.stdout);
                }
            });   
        }
        catch (ex) {
            core.warning(`Failed to get dockerfile paths for image ${image.toString()} | ` + ex);
        }

        if(resultObj){
            resultObj = resultObj[0];
            if((resultObj.Config) && (resultObj.Config.Labels) && (resultObj.Config.Labels[DOCKERFILE_PATH_LABEL_KEY])){
                imageDockerfilePathObj[image] = resultObj.Config.Labels[DOCKERFILE_PATH_LABEL_KEY];
            }
            else{
                imageDockerfilePathObj[image] = 'Not available';
            }
            imageDockerfilePathList.push(imageDockerfilePathObj);
        }
    }
    
    filePathsConfig[DOCKERFILE_PATH_KEY] = imageDockerfilePathList;

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
