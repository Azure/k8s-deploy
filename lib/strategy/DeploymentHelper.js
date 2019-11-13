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
const path = require("path");
const core = require("@actions/core");
const yaml = require("js-yaml");
const canaryDeploymentHelper = require("./CanaryDeploymentHelper");
const KubernetesObjectUtility = require("./KubernetesObjectUtility");
const TaskInputParameters = require("../input-parameters");
const models = require("../kubernetesconstants");
const fileHelper = require("./FileHelper");
const utils = require("./utilities");
const KubernetesManifestUtility = require("../kubernetes-manifest-utility");
const KubernetesConstants = require("../kubernetesconstants");
const PodCanaryDeploymentHelper_1 = require("./PodCanaryDeploymentHelper");
const SMICanaryDeploymentHelper_1 = require("./SMICanaryDeploymentHelper");
const utility_1 = require("../utility");
function deploy(kubectl, manifestFilePaths, deploymentStrategy) {
    return __awaiter(this, void 0, void 0, function* () {
        // get manifest files
        let inputManifestFiles = getManifestFiles(manifestFilePaths);
        // artifact substitution
        inputManifestFiles = updateContainerImagesInManifestFiles(inputManifestFiles, TaskInputParameters.containers);
        // imagePullSecrets addition
        inputManifestFiles = updateImagePullSecretsInManifestFiles(inputManifestFiles, TaskInputParameters.imagePullSecrets);
        console.log("isCanary: ", isCanaryDeploymentStrategy(deploymentStrategy));
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
            canaryDeploymentOutput = SMICanaryDeploymentHelper_1.deploySMICanary(kubectl, files);
        }
        else {
            canaryDeploymentOutput = PodCanaryDeploymentHelper_1.deployPodCanary(kubectl, files);
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
function updateContainerImagesInManifestFiles(filePaths, containers) {
    if (!!containers && containers.length > 0) {
        const newFilePaths = [];
        const tempDirectory = fileHelper.getTempDirectory();
        filePaths.forEach((filePath) => {
            let contents = fs.readFileSync(filePath).toString();
            containers.forEach((container) => {
                let imageName = container.split(':')[0];
                if (imageName.indexOf('@') > 0) {
                    imageName = imageName.split('@')[0];
                }
                if (contents.indexOf(imageName) > 0) {
                    contents = utils.substituteImageNameInSpecFile(contents, imageName, container);
                }
            });
            const fileName = path.join(tempDirectory, path.basename(filePath));
            fs.writeFileSync(path.join(fileName), contents);
            newFilePaths.push(fileName);
        });
        return newFilePaths;
    }
    return filePaths;
}
function updateImagePullSecretsInManifestFiles(filePaths, imagePullSecrets) {
    if (!!imagePullSecrets && imagePullSecrets.length > 0) {
        const newObjectsList = [];
        filePaths.forEach((filePath) => {
            const fileContents = fs.readFileSync(filePath).toString();
            yaml.safeLoadAll(fileContents, function (inputObject) {
                if (!!inputObject && !!inputObject.kind) {
                    const kind = inputObject.kind;
                    if (KubernetesObjectUtility.isWorkloadEntity(kind)) {
                        KubernetesObjectUtility.updateImagePullSecrets(inputObject, imagePullSecrets, false);
                    }
                    newObjectsList.push(inputObject);
                }
            });
        });
        core.debug('New K8s objects after addin imagePullSecrets are :' + JSON.stringify(newObjectsList));
        const newFilePaths = fileHelper.writeObjectsToFile(newObjectsList);
        return newFilePaths;
    }
    return filePaths;
}
function isCanaryDeploymentStrategy(deploymentStrategy) {
    return deploymentStrategy != null && deploymentStrategy.toUpperCase() === canaryDeploymentHelper.CANARY_DEPLOYMENT_STRATEGY.toUpperCase();
}
