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
exports.isValidAction = exports.getNormalizedPath = exports.isHttpUrl = exports.getRandomGuid = exports.getCurrentTime = exports.getRandomInt = exports.sleep = exports.getDeploymentConfig = exports.annotateChildPods = exports.getWorkflowFilePath = exports.getLastSuccessfulRunSha = exports.checkForErrors = exports.isEqual = exports.getExecutableExtension = void 0;
const os = require("os");
const uuid_1 = require("uuid");
const core = require("@actions/core");
const githubClient_1 = require("../githubClient");
const httpClient_1 = require("./httpClient");
const inputParams = require("../input-parameters");
const docker_object_model_1 = require("../docker-object-model");
const io = require("@actions/io");
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
exports.annotateChildPods = annotateChildPods;
// Should never throw.
function getDeploymentConfig() {
    return __awaiter(this, void 0, void 0, function* () {
        let helmChartPaths = (process.env.HELM_CHART_PATHS && process.env.HELM_CHART_PATHS.split(';').filter(path => path != "")) || [];
        helmChartPaths = helmChartPaths.map(helmchart => getNormalizedPath(helmchart.trim()));
        let inputManifestFiles = [];
        if (!helmChartPaths.length) {
            inputManifestFiles = inputParams.manifests || [];
            inputManifestFiles = inputManifestFiles.map(manifestFile => getNormalizedPath(manifestFile));
        }
        const imageNames = inputParams.containers || [];
        let imageDockerfilePathMap = {};
        try {
            yield checkDockerPath();
            //Fetching from image label if available
            for (const image of imageNames) {
                try {
                    imageDockerfilePathMap[image] = yield getDockerfilePath(image);
                }
                catch (ex) {
                    core.warning(`Failed to get dockerfile path for image ${image.toString()} | ` + ex);
                }
            }
        }
        catch (ex) {
            core.warning(`Failed to get dockerfile path for images | ` + ex);
        }
        const deploymentConfig = {
            manifestFilePaths: inputManifestFiles,
            helmChartFilePaths: helmChartPaths,
            dockerfilePaths: imageDockerfilePathMap
        };
        return Promise.resolve(deploymentConfig);
    });
}
exports.getDeploymentConfig = getDeploymentConfig;
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
function getRandomGuid() {
    return uuid_1.v4();
}
exports.getRandomGuid = getRandomGuid;
function checkDockerPath() {
    return __awaiter(this, void 0, void 0, function* () {
        let dockerPath = yield io.which('docker', false);
        if (!dockerPath) {
            throw new Error('Docker is not installed.');
        }
    });
}
function getDockerfilePath(image) {
    return __awaiter(this, void 0, void 0, function* () {
        let imageConfig, imageInspectResult;
        var dockerExec = new docker_object_model_1.DockerExec('docker');
        dockerExec.pull(image, [], true);
        imageInspectResult = dockerExec.inspect(image, [], true);
        imageConfig = JSON.parse(imageInspectResult)[0];
        const DOCKERFILE_PATH_LABEL_KEY = 'dockerfile-path';
        let pathValue = '';
        if (imageConfig) {
            if ((imageConfig.Config) && (imageConfig.Config.Labels) && (imageConfig.Config.Labels[DOCKERFILE_PATH_LABEL_KEY])) {
                const pathLabel = imageConfig.Config.Labels[DOCKERFILE_PATH_LABEL_KEY];
                pathValue = getNormalizedPath(pathLabel);
            }
        }
        return pathValue;
    });
}
function isHttpUrl(url) {
    const HTTP_REGEX = /^https?:\/\/.*$/;
    return HTTP_REGEX.test(url);
}
exports.isHttpUrl = isHttpUrl;
function getNormalizedPath(pathValue) {
    if (!isHttpUrl(pathValue)) { //if it is not an http url then convert to link from current repo and commit 
        return `https://github.com/${process.env.GITHUB_REPOSITORY}/blob/${process.env.GITHUB_SHA}/${pathValue}`;
    }
    return pathValue;
}
exports.getNormalizedPath = getNormalizedPath;
function isValidAction(action) {
    return action === 'deploy'
        || action === 'promote'
        || action === 'reject';
}
exports.isValidAction = isValidAction;
