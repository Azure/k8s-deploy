'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const yaml = require("js-yaml");
const canaryDeploymentHelper = require("./canary-deployment-helper");
const KubernetesObjectUtility = require("../resource-object-utility");
const TaskInputParameters = require("../../input-parameters");
const models = require("../../constants");
const fileHelper = require("../files-helper");
const utils = require("../manifest-utilities");
const KubernetesManifestUtility = require("../manifest-stability-utility");
const KubernetesConstants = require("../../constants");
const pod_canary_deployment_helper_1 = require("./pod-canary-deployment-helper");
const smi_canary_deployment_helper_1 = require("./smi-canary-deployment-helper");
const utility_1 = require("../utility");
const string_comparison_1 = require("../string-comparison");
function deploy(kubectl, manifestFilePaths, deploymentStrategy) {
    return __awaiter(this, void 0, void 0, function* () {
        // get manifest files
        let inputManifestFiles = getManifestFiles(manifestFilePaths);
        // imagePullSecrets addition
        inputManifestFiles = updateResourcesObjects(inputManifestFiles, TaskInputParameters.imagePullSecrets, TaskInputParameters.containers);
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
            result = kubectl.apply(updatedManifests);
        }
        else {
            result = kubectl.apply(files);
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
function updateResourcesObjects(filePaths, imagePullSecrets, containers) {
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
            if (!!inputObject && !!inputObject.kind) {
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
    return filePaths;
}
function isCanaryDeploymentStrategy(deploymentStrategy) {
    return deploymentStrategy != null && deploymentStrategy.toUpperCase() === canaryDeploymentHelper.CANARY_DEPLOYMENT_STRATEGY.toUpperCase();
}
