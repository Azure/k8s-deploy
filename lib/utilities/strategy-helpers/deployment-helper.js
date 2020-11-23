'use strict';
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
exports.deploy = void 0;
const fs = require("fs");
const core = require("@actions/core");
const yaml = require("js-yaml");
const canaryDeploymentHelper = require("./canary-deployment-helper");
const KubernetesObjectUtility = require("../resource-object-utility");
const TaskInputParameters = require("../../input-parameters");
const models = require("../../constants");
const fileHelper = require("../files-helper");
const utils = require("../manifest-utilities");
const KubernetesManifestUtility = require("../manifest-stability-utility");
const KubernetesConstants = require("../../constants");
const string_comparison_1 = require("./../string-comparison");
const pod_canary_deployment_helper_1 = require("./pod-canary-deployment-helper");
const smi_canary_deployment_helper_1 = require("./smi-canary-deployment-helper");
const utility_1 = require("../utility");
function deploy(kubectl, manifestFilePaths, deploymentStrategy) {
    return __awaiter(this, void 0, void 0, function* () {
        // get manifest files
        let inputManifestFiles = getManifestFiles(manifestFilePaths);
        // artifact substitution
        inputManifestFiles = updateResourceObjects(inputManifestFiles, TaskInputParameters.imagePullSecrets, TaskInputParameters.containers);
        // deployment
        const deployedManifestFiles = deployManifests(inputManifestFiles, kubectl, isCanaryDeploymentStrategy(deploymentStrategy));
        // check manifest stability
        const resourceTypes = KubernetesObjectUtility.getResources(deployedManifestFiles, models.deploymentTypes.concat([KubernetesConstants.DiscoveryAndLoadBalancerResource.service]));
        yield checkManifestStability(kubectl, resourceTypes);
        // print ingress resources
        const ingressResources = KubernetesObjectUtility.getResources(deployedManifestFiles, [KubernetesConstants.DiscoveryAndLoadBalancerResource.ingress]);
        ingressResources.forEach(ingressResource => {
            kubectl.getResource(KubernetesConstants.DiscoveryAndLoadBalancerResource.ingress, ingressResource.name);
        });
        // annotate resources
        let allPods;
        try {
            allPods = JSON.parse((kubectl.getAllPods()).stdout);
        }
        catch (e) {
            core.debug("Unable to parse pods; Error: " + e);
        }
        annotateAndLabelResources(deployedManifestFiles, kubectl, resourceTypes, allPods);
    });
}
exports.deploy = deploy;
function getManifestFiles(manifestFilePaths) {
    const files = utils.getManifestFiles(manifestFilePaths);
    if (files == null || files.length === 0) {
        throw new Error(`ManifestFileNotFound : ${manifestFilePaths}`);
    }
    return files;
}
function deployManifests(files, kubectl, isCanaryDeploymentStrategy) {
    let result;
    if (isCanaryDeploymentStrategy) {
        let canaryDeploymentOutput;
        if (canaryDeploymentHelper.isSMICanaryStrategy()) {
            canaryDeploymentOutput = smi_canary_deployment_helper_1.deploySMICanary(kubectl, files);
        }
        else {
            canaryDeploymentOutput = pod_canary_deployment_helper_1.deployPodCanary(kubectl, files);
        }
        result = canaryDeploymentOutput.result;
        files = canaryDeploymentOutput.newFilePaths;
    }
    else {
        if (canaryDeploymentHelper.isSMICanaryStrategy()) {
            const updatedManifests = appendStableVersionLabelToResource(files, kubectl);
            result = kubectl.apply(updatedManifests, TaskInputParameters.forceDeployment);
        }
        else {
            result = kubectl.apply(files, TaskInputParameters.forceDeployment);
        }
    }
    utility_1.checkForErrors([result]);
    return files;
}
function appendStableVersionLabelToResource(files, kubectl) {
    const manifestFiles = [];
    const newObjectsList = [];
    files.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const kind = inputObject.kind;
            if (KubernetesObjectUtility.isDeploymentEntity(kind)) {
                const updatedObject = canaryDeploymentHelper.markResourceAsStable(inputObject);
                newObjectsList.push(updatedObject);
            }
            else {
                manifestFiles.push(filePath);
            }
        });
    });
    const updatedManifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    manifestFiles.push(...updatedManifestFiles);
    return manifestFiles;
}
function checkManifestStability(kubectl, resources) {
    return __awaiter(this, void 0, void 0, function* () {
        yield KubernetesManifestUtility.checkManifestStability(kubectl, resources);
    });
}
function annotateAndLabelResources(files, kubectl, resourceTypes, allPods) {
    return __awaiter(this, void 0, void 0, function* () {
        const workflowFilePath = yield utility_1.getWorkflowFilePath(TaskInputParameters.githubToken);
        const filePathsConfig = yield utility_1.getFilePathsConfigs();
        const annotationKeyLabel = models.getWorkflowAnnotationKeyLabel(workflowFilePath);
        annotateResources(files, kubectl, resourceTypes, allPods, annotationKeyLabel, workflowFilePath, filePathsConfig);
        labelResources(files, kubectl, annotationKeyLabel);
    });
}
function annotateResources(files, kubectl, resourceTypes, allPods, annotationKey, workflowFilePath, filePathsConfig) {
    const annotateResults = [];
    const lastSuccessSha = utility_1.getLastSuccessfulRunSha(kubectl, TaskInputParameters.namespace, annotationKey);
    let annotationKeyValStr = annotationKey + '=' + models.getWorkflowAnnotationsJson(lastSuccessSha, workflowFilePath, filePathsConfig);
    annotateResults.push(kubectl.annotate('namespace', TaskInputParameters.namespace, annotationKeyValStr));
    annotateResults.push(kubectl.annotateFiles(files, annotationKeyValStr));
    resourceTypes.forEach(resource => {
        if (resource.type.toUpperCase() !== models.KubernetesWorkload.pod.toUpperCase()) {
            utility_1.annotateChildPods(kubectl, resource.type, resource.name, annotationKeyValStr, allPods)
                .forEach(execResult => annotateResults.push(execResult));
        }
    });
    utility_1.checkForErrors(annotateResults, true);
}
function labelResources(files, kubectl, label) {
    let workflowName = process.env.GITHUB_WORKFLOW;
    workflowName = workflowName.startsWith('.github/workflows/') ?
        workflowName.replace(".github/workflows/", "") : workflowName;
    const labels = [`workflowFriendlyName=${workflowName}`, `workflow=${label}`];
    utility_1.checkForErrors([kubectl.labelFiles(files, labels)], true);
}
function updateResourceObjects(filePaths, imagePullSecrets, containers) {
    const newObjectsList = [];
    const updateResourceObject = (inputObject) => {
        if (!!imagePullSecrets && imagePullSecrets.length > 0) {
            KubernetesObjectUtility.updateImagePullSecrets(inputObject, imagePullSecrets, false);
        }
        if (!!containers && containers.length > 0) {
            KubernetesObjectUtility.updateImageDetails(inputObject, containers);
        }
    };
    filePaths.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath).toString();
        yaml.safeLoadAll(fileContents, function (inputObject) {
            if (inputObject && inputObject.kind) {
                const kind = inputObject.kind;
                if (KubernetesObjectUtility.isWorkloadEntity(kind)) {
                    updateResourceObject(inputObject);
                }
                else if (string_comparison_1.isEqual(kind, 'list', string_comparison_1.StringComparer.OrdinalIgnoreCase)) {
                    let items = inputObject.items;
                    if (items.length > 0) {
                        items.forEach((item) => updateResourceObject(item));
                    }
                }
                newObjectsList.push(inputObject);
            }
        });
    });
    core.debug('New K8s objects after adding imagePullSecrets are :' + JSON.stringify(newObjectsList));
    const newFilePaths = fileHelper.writeObjectsToFile(newObjectsList);
    return newFilePaths;
}
function isCanaryDeploymentStrategy(deploymentStrategy) {
    return deploymentStrategy != null && deploymentStrategy.toUpperCase() === canaryDeploymentHelper.CANARY_DEPLOYMENT_STRATEGY.toUpperCase();
}
