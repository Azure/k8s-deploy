import * as os from 'os';
import * as core from '@actions/core';
import { IExecSyncResult } from './tool-runner';
import { Kubectl } from '../kubectl-object-model';
import { GitHubClient } from '../githubClient';
import { StatusCodes } from "./httpClient";
import * as exec from "./exec";
import * as inputParams from "../input-parameters";
import * as fileHelper from './files-helper';
import { info } from 'console';

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

export async function getFilePathsConfigs(kubectl: Kubectl): Promise<any> {

    let filePathsConfig: any = {};
    const BUILD_CONFIG_KEY = 'buildConfigs';
    const MANIFEST_PATHS_KEY = 'manifestFilePaths';
    const HELM_CHART_KEY = 'helmChartFilePaths';
    
    let inputManifestFiles = inputParams.manifests;
    filePathsConfig[MANIFEST_PATHS_KEY] = inputManifestFiles || '';

    let helmChartPath = process.env.HELM_CHART_PATH || '';
    filePathsConfig[HELM_CHART_KEY] = helmChartPath;

    //From image file
    core.info(`🏃 Getting images dockerfile info...`);
    let imageToBuildConfigMap: any = {};
    let imageNames = core.getInput('images').split('\n');
    let imagePullSecrets = inputParams.imagePullSecrets;
    let k = 0;

    //Fetch image info
    for(const image of imageNames){
        let args: string[] = [image];
        let resultObj: any;
        let buildConfigMap : any = {};
        let imagePullSecret = imagePullSecrets[k++];
        let containerRegistryName = image.toString().split('@')[0].split('/')[0];

        try{

            if(!fileHelper.doesFileExist('~/.docker/config.json'))
            {
                //get secrets/db-user-pass --template='{{.data.password | base64decode }}'
                let kubectlArgsPassword: string = `${imagePullSecret} --template='{{.data.password | base64 --decode }}' `;
                let pwd = kubectl.executeCommand('get secrets', kubectlArgsPassword);
                let kubectlArgsUsername: string = `${imagePullSecret} --template='{{.data.username | base64 --decode }}' `;
                let username = kubectl.executeCommand('get secrets', kubectlArgsUsername);

                //core.info(`Kubectl Result : ${ result.code }, ${ result.stdout }  `);
                if(pwd && username)
                {
                    let loginArgs: string[] = [containerRegistryName, '--username', username.stdout, '--password', pwd.stdout];
                    await exec.exec('docker login ', loginArgs, false).then(res => {
                        if (res.stderr != '' && !res.success) {
                            throw new Error(`docker login failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
                        }
                    });
                }
                else
                {
                    throw new Error('kubectl secret fetch failed.');
                }
            }

            await exec.exec('docker pull ', args, false).then(res => {
                if (res.stderr != '' && !res.success) {
                    throw new Error(`docker images pull failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
                }
            });

            await exec.exec('docker inspect --type=image', args, true).then(res => {
                if (res.stderr != '' && !res.success) {
                    throw new Error(`docker inspect call failed with: ${res.stderr.match(/(.*)\s*$/)![0]}`);
                }
                resultObj = JSON.parse(res.stdout)[0];
            });   
        }
        catch (ex) {
            core.warning(`Failed to get dockerfile paths for image ${image.toString()} : ${JSON.stringify(ex)}`);
        }

        const DOCKERFILE_PATH_LABEL_KEY = 'dockerfile-path';
        const DOCKERFILE_PATH_KEY = 'dockerfilePath';
        const CONTAINER_REG_KEY = 'containerRegistryServer';

        if(resultObj != null && resultObj.Config != null && resultObj.Config.Labels != null ){
            if(resultObj.Config.Labels[DOCKERFILE_PATH_LABEL_KEY] !=null){
                buildConfigMap[DOCKERFILE_PATH_KEY] = resultObj.Config.Labels[DOCKERFILE_PATH_LABEL_KEY];
            } 
            //Add CR link to build config
            buildConfigMap[CONTAINER_REG_KEY] = containerRegistryName;
            //core.info(`Image Map :: ${JSON.stringify(buildConfigMap)}`);
            imageToBuildConfigMap[image.toString().split('@')[1]] = buildConfigMap;
        }
    }
    filePathsConfig[BUILD_CONFIG_KEY] = imageToBuildConfigMap;

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
