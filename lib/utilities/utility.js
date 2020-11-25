"use strict";
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
exports.getCurrentTime = exports.getRandomInt = exports.sleep = exports.getFilePathsConfigs = exports.annotateChildPods = exports.getWorkflowFilePath = exports.getLastSuccessfulRunSha = exports.checkForErrors = exports.isEqual = exports.getExecutableExtension = void 0;
const os = require("os");
const core = require("@actions/core");
const githubClient_1 = require("../githubClient");
const httpClient_1 = require("./httpClient");
const exec = require("./exec");
const inputParams = require("../input-parameters");
function getExecutableExtension() {
    if (os.type().match(/^Win/)) {
        return '.exe';
    }
    return '';
}
exports.getExecutableExtension = getExecutableExtension;
function isEqual(str1, str2, ignoreCase) {
    if (str1 == null && str2 == null) {
        return true;
    }
    if (str1 == null || str2 == null) {
        return false;
    }
    if (ignoreCase) {
        return str1.toUpperCase() === str2.toUpperCase();
    }
    else {
        return str1 === str2;
    }
}
exports.isEqual = isEqual;
function checkForErrors(execResults, warnIfError) {
    if (execResults.length !== 0) {
        let stderr = '';
        execResults.forEach(result => {
            if (result && result.stderr) {
                if (result.code !== 0) {
                    stderr += result.stderr + '\n';
                }
                else {
                    core.warning(result.stderr);
                }
            }
        });
        if (stderr.length > 0) {
            if (warnIfError) {
                core.warning(stderr.trim());
            }
            else {
                throw new Error(stderr.trim());
            }
        }
    }
}
exports.checkForErrors = checkForErrors;
function getLastSuccessfulRunSha(kubectl, namespaceName, annotationKey) {
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
exports.getLastSuccessfulRunSha = getLastSuccessfulRunSha;
function getWorkflowFilePath(githubToken) {
    return __awaiter(this, void 0, void 0, function* () {
        let workflowFilePath = process.env.GITHUB_WORKFLOW;
        if (!workflowFilePath.startsWith('.github/workflows/')) {
            const githubClient = new githubClient_1.GitHubClient(process.env.GITHUB_REPOSITORY, githubToken);
            const response = yield githubClient.getWorkflows();
            if (response) {
                if (response.statusCode == httpClient_1.StatusCodes.OK
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
                else if (response.statusCode != httpClient_1.StatusCodes.OK) {
                    core.debug(`An error occured while getting list of workflows on the repo. Statuscode: ${response.statusCode}, StatusMessage: ${response.statusMessage}`);
                }
            }
            else {
                core.warning(`Failed to get response from workflow list API`);
            }
        }
        return Promise.resolve(workflowFilePath);
    });
}
exports.getWorkflowFilePath = getWorkflowFilePath;
function annotateChildPods(kubectl, resourceType, resourceName, annotationKeyValStr, allPods) {
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
exports.annotateChildPods = annotateChildPods;
function getFilePathsConfigs() {
    return __awaiter(this, void 0, void 0, function* () {
        let filePathsConfig = {};
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
        let imageDockerfilePathMap = {};
        let pathKey, pathVal;
        //Fetching from env var if available
        let dockerfilePathsList = (process.env.DOCKERFILEPATHS && process.env.DOCKERFILEPATHS.split('\n')) || [];
        dockerfilePathsList.forEach(path => {
            if (path) {
                pathKey = path.split(' ')[0];
                pathVal = path.split(' ')[1];
                imageDockerfilePathMap[pathKey] = pathVal;
            }
        });
        //Fetching from image lable if available
        for (const image of imageNames) {
            let args = [image];
            let resultObj;
            let containerRegistryName = image;
            try {
                let usrname = process.env.CR_USERNAME || null;
                let pwd = process.env.CR_PASSWORD || null;
                if (pwd && usrname) {
                    let loginArgs = [containerRegistryName, '--username', usrname, '--password', pwd];
                    yield exec.exec('docker login ', loginArgs, true).then(res => {
                        if (res.stderr != '' && !res.success) {
                            throw new Error(`docker login failed with: ${res.stderr.match(/(.*)\s*$/)[0]}`);
                        }
                    });
                }
                yield exec.exec('docker pull ', args, true).then(res => {
                    if (res.stderr != '' && !res.success) {
                        throw new Error(`docker images pull failed with: ${res.stderr.match(/(.*)\s*$/)[0]}`);
                    }
                });
                yield exec.exec('docker inspect --type=image', args, true).then(res => {
                    if (res.stderr != '' && !res.success) {
                        throw new Error(`docker inspect call failed with: ${res.stderr.match(/(.*)\s*$/)[0]}`);
                    }
                    if (res.stdout) {
                        resultObj = JSON.parse(res.stdout);
                    }
                });
            }
            catch (ex) {
                core.warning(`Failed to get dockerfile paths for image ${image.toString()} | ` + ex);
            }
            if (resultObj) {
                resultObj = resultObj[0];
                if ((resultObj.Config) && (resultObj.Config.Labels) && (resultObj.Config.Labels[DOCKERFILE_PATH_LABEL_KEY])) {
                    pathVal = resultObj.Config.Labels[DOCKERFILE_PATH_LABEL_KEY];
                }
                else {
                    pathVal = 'Not available';
                }
                if (!imageDockerfilePathMap[image]) { //If (image : someVal) does not exist from env var parsing then add
                    imageDockerfilePathMap[image] = pathVal;
                }
            }
        }
        filePathsConfig[DOCKERFILE_PATH_KEY] = imageDockerfilePathMap;
        return Promise.resolve(filePathsConfig);
    });
}
exports.getFilePathsConfigs = getFilePathsConfigs;
function sleep(timeout) {
    return new Promise(resolve => setTimeout(resolve, timeout));
}
exports.sleep = sleep;
function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max));
}
exports.getRandomInt = getRandomInt;
function getCurrentTime() {
    return new Date().getTime();
}
exports.getCurrentTime = getCurrentTime;
