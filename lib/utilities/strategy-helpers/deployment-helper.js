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
exports.getManifestFiles = exports.deploy = void 0;
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
const manifest_utilities_1 = require("../manifest-utilities");
const pod_canary_deployment_helper_1 = require("./pod-canary-deployment-helper");
const smi_canary_deployment_helper_1 = require("./smi-canary-deployment-helper");
const utility_1 = require("../utility");
const blue_green_helper_1 = require("./blue-green-helper");
const service_blue_green_helper_1 = require("./service-blue-green-helper");
const ingress_blue_green_helper_1 = require("./ingress-blue-green-helper");
const smi_blue_green_helper_1 = require("./smi-blue-green-helper");
function deploy(kubectl, manifestFilePaths, deploymentStrategy) {
    return __awaiter(this, void 0, void 0, function* () {
        // get manifest files
        let inputManifestFiles = manifest_utilities_1.getUpdatedManifestFiles(manifestFilePaths);
        // deployment
        const deployedManifestFiles = deployManifests(inputManifestFiles, kubectl, isCanaryDeploymentStrategy(deploymentStrategy), service_blue_green_helper_1.isBlueGreenDeploymentStrategy());
        // check manifest stability
        const resourceTypes = KubernetesObjectUtility.getResources(deployedManifestFiles, models.deploymentTypes.concat([KubernetesConstants.DiscoveryAndLoadBalancerResource.service]));
        yield checkManifestStability(kubectl, resourceTypes);
        // route blue-green deployments
        if (service_blue_green_helper_1.isBlueGreenDeploymentStrategy()) {
            yield routeBlueGreen(kubectl, inputManifestFiles);
        }
        // print ingress resources
        const ingressResources = KubernetesObjectUtility.getResources(deployedManifestFiles, [KubernetesConstants.DiscoveryAndLoadBalancerResource.ingress]);
        ingressResources.forEach(ingressResource => {
            kubectl.getResource(KubernetesConstants.DiscoveryAndLoadBalancerResource.ingress, ingressResource.name);
        });
    });
}
exports.deploy = deploy;
function routeBlueGreen(kubectl, inputManifestFiles) {
    return __awaiter(this, void 0, void 0, function* () {
        // get buffer time
        let sleepTime = parseInt(TaskInputParameters.versionSwitchBuffer);
        //logging start of buffer time
        let temp = new Date();
        console.log('starting buffer time of ' + sleepTime + ' minute/s at ' + temp.getHours() + ':' + temp.getMinutes() + ':' + temp.getSeconds() + ' UTC');
        // waiting
        yield utility_1.sleep(sleepTime * 1000 * 60);
        // logging end of buffer time
        temp = new Date();
        console.log('stopping buffer time of ' + sleepTime + ' minute/s at ' + temp.getHours() + ':' + temp.getMinutes() + ':' + temp.getSeconds() + ' UTC');
        const manifestObjects = blue_green_helper_1.getManifestObjects(inputManifestFiles);
        // routing to new deployments
        if (ingress_blue_green_helper_1.isIngressRoute()) {
            ingress_blue_green_helper_1.blueGreenRouteIngress(kubectl, blue_green_helper_1.BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.serviceNameMap, manifestObjects.serviceEntityList, manifestObjects.ingressEntityList);
        }
        else if (smi_blue_green_helper_1.isSMIRoute()) {
            smi_blue_green_helper_1.blueGreenRouteTraffic(kubectl, blue_green_helper_1.BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
        }
        else {
            service_blue_green_helper_1.blueGreenRouteService(kubectl, blue_green_helper_1.BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
        }
    });
}
function getManifestFiles(manifestFilePaths) {
    const files = utils.getManifestFiles(manifestFilePaths);
    if (files == null || files.length === 0) {
        throw new Error(`ManifestFileNotFound : ${manifestFilePaths}`);
    }
    return files;
}
exports.getManifestFiles = getManifestFiles;
function deployManifests(files, kubectl, isCanaryDeploymentStrategy, isBlueGreenDeploymentStrategy) {
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
    else if (isBlueGreenDeploymentStrategy) {
        let blueGreenDeploymentOutput;
        if (ingress_blue_green_helper_1.isIngressRoute()) {
            blueGreenDeploymentOutput = ingress_blue_green_helper_1.deployBlueGreenIngress(kubectl, files);
        }
        else if (smi_blue_green_helper_1.isSMIRoute()) {
            blueGreenDeploymentOutput = smi_blue_green_helper_1.deployBlueGreenSMI(kubectl, files);
        }
        else {
            blueGreenDeploymentOutput = service_blue_green_helper_1.deployBlueGreen(kubectl, files);
        }
        result = blueGreenDeploymentOutput.result;
        files = blueGreenDeploymentOutput.newFilePaths;
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
function isCanaryDeploymentStrategy(deploymentStrategy) {
    return deploymentStrategy != null && deploymentStrategy.toUpperCase() === canaryDeploymentHelper.CANARY_DEPLOYMENT_STRATEGY.toUpperCase();
}
