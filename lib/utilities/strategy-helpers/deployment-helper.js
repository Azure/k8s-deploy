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
exports.isCanaryDeploymentStrategy = exports.annotateAndLabelResources = exports.checkManifestStability = exports.deployManifests = exports.getManifestFiles = void 0;
const fs = require("fs");
const yaml = require("js-yaml");
const canaryDeploymentHelper = require("./canary-deployment-helper");
const KubernetesObjectUtility = require("../resource-object-utility");
const TaskInputParameters = require("../../input-parameters");
const models = require("../../constants");
const fileHelper = require("../files-helper");
const utils = require("../manifest-utilities");
const KubernetesManifestUtility = require("../manifest-stability-utility");
const pod_canary_deployment_helper_1 = require("./pod-canary-deployment-helper");
const smi_canary_deployment_helper_1 = require("./smi-canary-deployment-helper");
const utility_1 = require("../utility");
const service_blue_green_helper_1 = require("./service-blue-green-helper");
const ingress_blue_green_helper_1 = require("./ingress-blue-green-helper");
const smi_blue_green_helper_1 = require("./smi-blue-green-helper");
const deploymentStrategy_1 = require("../../types/deploymentStrategy");
const core = require("@actions/core");
const trafficSplitMethod_1 = require("../../types/trafficSplitMethod");
const routeStrategy_1 = require("../../types/routeStrategy");
function getManifestFiles(manifestFilePaths) {
    const files = utils.getManifestFiles(manifestFilePaths);
    if (files == null || files.length === 0) {
        throw new Error(`ManifestFileNotFound : ${manifestFilePaths}`);
    }
    return files;
}
exports.getManifestFiles = getManifestFiles;
function deployManifests(files, deploymentStrategy, kubectl) {
    switch (deploymentStrategy) {
        case deploymentStrategy_1.DeploymentStrategy.CANARY: {
            const trafficSplitMethod = trafficSplitMethod_1.parseTrafficSplitMethod(core.getInput("traffic-split-method", { required: true }));
            const { result, newFilePaths } = trafficSplitMethod == trafficSplitMethod_1.TrafficSplitMethod.SMI
                ? smi_canary_deployment_helper_1.deploySMICanary(files, kubectl)
                : pod_canary_deployment_helper_1.deployPodCanary(files, kubectl);
            utility_1.checkForErrors([result]);
            return newFilePaths;
        }
        case deploymentStrategy_1.DeploymentStrategy.BLUE_GREEN: {
            const routeStrategy = routeStrategy_1.parseRouteStrategy(core.getInput("route-method", { required: true }));
            const { result, newFilePaths } = (routeStrategy == routeStrategy_1.RouteStrategy.INGRESS &&
                ingress_blue_green_helper_1.deployBlueGreenIngress(files)) ||
                (routeStrategy == routeStrategy_1.RouteStrategy.SMI && smi_blue_green_helper_1.deployBlueGreenSMI(files)) ||
                service_blue_green_helper_1.deployBlueGreenService(files);
            utility_1.checkForErrors([result]);
            return newFilePaths;
        }
        case undefined: {
            core.warning("Deployment strategy is not recognized");
        }
        default: {
            const trafficSplitMethod = trafficSplitMethod_1.parseTrafficSplitMethod(core.getInput("traffic-split-method", { required: true }));
            if (trafficSplitMethod == trafficSplitMethod_1.TrafficSplitMethod.SMI) {
                const updatedManifests = appendStableVersionLabelToResource(files, kubectl);
                const result = kubectl.apply(updatedManifests, TaskInputParameters.forceDeployment);
                utility_1.checkForErrors([result]);
            }
            else {
                const result = kubectl.apply(files, TaskInputParameters.forceDeployment);
                utility_1.checkForErrors([result]);
            }
            return files;
        }
    }
}
exports.deployManifests = deployManifests;
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
exports.checkManifestStability = checkManifestStability;
function annotateAndLabelResources(files, kubectl, resourceTypes, allPods) {
    return __awaiter(this, void 0, void 0, function* () {
        const workflowFilePath = yield utility_1.getWorkflowFilePath(TaskInputParameters.githubToken);
        const deploymentConfig = yield utility_1.getDeploymentConfig();
        const annotationKeyLabel = models.getWorkflowAnnotationKeyLabel(workflowFilePath);
        annotateResources(files, kubectl, resourceTypes, allPods, annotationKeyLabel, workflowFilePath, deploymentConfig);
        labelResources(files, kubectl, annotationKeyLabel);
    });
}
exports.annotateAndLabelResources = annotateAndLabelResources;
function annotateResources(files, kubectl, resourceTypes, allPods, annotationKey, workflowFilePath, deploymentConfig) {
    const annotateResults = [];
    const lastSuccessSha = utility_1.getLastSuccessfulRunSha(kubectl, TaskInputParameters.namespace, annotationKey);
    let annotationKeyValStr = annotationKey +
        "=" +
        models.getWorkflowAnnotationsJson(lastSuccessSha, workflowFilePath, deploymentConfig);
    annotateResults.push(kubectl.annotate("namespace", TaskInputParameters.namespace, annotationKeyValStr));
    annotateResults.push(kubectl.annotateFiles(files, annotationKeyValStr));
    resourceTypes.forEach((resource) => {
        if (resource.type.toUpperCase() !==
            models.KubernetesWorkload.POD.toUpperCase()) {
            utility_1.annotateChildPods(kubectl, resource.type, resource.name, annotationKeyValStr, allPods).forEach((execResult) => annotateResults.push(execResult));
        }
    });
    utility_1.checkForErrors(annotateResults, true);
}
function labelResources(files, kubectl, label) {
    const labels = [
        `workflowFriendlyName=${utility_1.normaliseWorkflowStrLabel(process.env.GITHUB_WORKFLOW)}`,
        `workflow=${label}`,
    ];
    utility_1.checkForErrors([kubectl.labelFiles(files, labels)], true);
}
function isCanaryDeploymentStrategy(deploymentStrategy) {
    return (deploymentStrategy != null &&
        deploymentStrategy.toUpperCase() ===
            canaryDeploymentHelper.CANARY_DEPLOYMENT_STRATEGY.toUpperCase());
}
exports.isCanaryDeploymentStrategy = isCanaryDeploymentStrategy;
