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
exports.annotateAndLabelResources = exports.checkManifestStability = exports.deployManifests = void 0;
const fs = require("fs");
const yaml = require("js-yaml");
const canaryDeploymentHelper = require("./canary/canaryHelper");
const models = require("../types/kubernetesTypes");
const kubernetesTypes_1 = require("../types/kubernetesTypes");
const fileHelper = require("../utilities/fileUtils");
const KubernetesManifestUtility = require("../utilities/manifestStabilityUtils");
const podCanaryHelper_1 = require("./canary/podCanaryHelper");
const smiCanaryHelper_1 = require("./canary/smiCanaryHelper");
const serviceBlueGreenHelper_1 = require("./blueGreen/serviceBlueGreenHelper");
const ingressBlueGreenHelper_1 = require("./blueGreen/ingressBlueGreenHelper");
const smiBlueGreenHelper_1 = require("./blueGreen/smiBlueGreenHelper");
const deploymentStrategy_1 = require("../types/deploymentStrategy");
const core = require("@actions/core");
const trafficSplitMethod_1 = require("../types/trafficSplitMethod");
const routeStrategy_1 = require("../types/routeStrategy");
const workflowAnnotationUtils_1 = require("../utilities/workflowAnnotationUtils");
const kubectlUtils_1 = require("../utilities/kubectlUtils");
const githubUtils_1 = require("../utilities/githubUtils");
const dockerUtils_1 = require("../utilities/dockerUtils");
function deployManifests(files, deploymentStrategy, kubectl, trafficSplitMethod) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (deploymentStrategy) {
            case deploymentStrategy_1.DeploymentStrategy.CANARY: {
                const { result, newFilePaths } = trafficSplitMethod == trafficSplitMethod_1.TrafficSplitMethod.SMI
                    ? yield smiCanaryHelper_1.deploySMICanary(files, kubectl)
                    : yield podCanaryHelper_1.deployPodCanary(files, kubectl);
                kubectlUtils_1.checkForErrors([result]);
                return newFilePaths;
            }
            case deploymentStrategy_1.DeploymentStrategy.BLUE_GREEN: {
                const routeStrategy = routeStrategy_1.parseRouteStrategy(core.getInput("route-method", { required: true }));
                const { result, newFilePaths } = yield Promise.resolve((routeStrategy == routeStrategy_1.RouteStrategy.INGRESS &&
                    ingressBlueGreenHelper_1.deployBlueGreenIngress(kubectl, files)) ||
                    (routeStrategy == routeStrategy_1.RouteStrategy.SMI &&
                        smiBlueGreenHelper_1.deployBlueGreenSMI(kubectl, files)) ||
                    serviceBlueGreenHelper_1.deployBlueGreenService(kubectl, files));
                kubectlUtils_1.checkForErrors([result]);
                return newFilePaths;
            }
            case undefined: {
                core.warning("Deployment strategy is not recognized.");
            }
            default: {
                const trafficSplitMethod = trafficSplitMethod_1.parseTrafficSplitMethod(core.getInput("traffic-split-method", { required: true }));
                const forceDeployment = core.getInput("force").toLowerCase() === "true";
                if (trafficSplitMethod === trafficSplitMethod_1.TrafficSplitMethod.SMI) {
                    const updatedManifests = appendStableVersionLabelToResource(files);
                    const result = yield kubectl.apply(updatedManifests, forceDeployment);
                    kubectlUtils_1.checkForErrors([result]);
                }
                else {
                    const result = yield kubectl.apply(files, forceDeployment);
                    kubectlUtils_1.checkForErrors([result]);
                }
                return files;
            }
        }
    });
}
exports.deployManifests = deployManifests;
function appendStableVersionLabelToResource(files) {
    const manifestFiles = [];
    const newObjectsList = [];
    files.forEach((filePath) => {
        const fileContents = fs.readFileSync(filePath).toString();
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const { kind } = inputObject;
            if (kubernetesTypes_1.isDeploymentEntity(kind)) {
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
        const githubToken = core.getInput("token");
        const workflowFilePath = yield githubUtils_1.getWorkflowFilePath(githubToken);
        const deploymentConfig = yield dockerUtils_1.getDeploymentConfig();
        const annotationKeyLabel = workflowAnnotationUtils_1.getWorkflowAnnotationKeyLabel(workflowFilePath);
        yield annotateResources(files, kubectl, resourceTypes, allPods, annotationKeyLabel, workflowFilePath, deploymentConfig);
        yield labelResources(files, kubectl, annotationKeyLabel);
    });
}
exports.annotateAndLabelResources = annotateAndLabelResources;
function annotateResources(files, kubectl, resourceTypes, allPods, annotationKey, workflowFilePath, deploymentConfig) {
    return __awaiter(this, void 0, void 0, function* () {
        const annotateResults = [];
        const namespace = core.getInput("namespace") || "default";
        const lastSuccessSha = yield kubectlUtils_1.getLastSuccessfulRunSha(kubectl, namespace, annotationKey);
        const annotationKeyValStr = `${annotationKey}=${workflowAnnotationUtils_1.getWorkflowAnnotations(lastSuccessSha, workflowFilePath, deploymentConfig)}`;
        annotateResults.push(yield kubectl.annotate("namespace", namespace, annotationKeyValStr));
        annotateResults.push(yield kubectl.annotateFiles(files, annotationKeyValStr));
        for (const resource of resourceTypes) {
            if (resource.type.toLowerCase() !==
                models.KubernetesWorkload.POD.toLowerCase()) {
                (yield kubectlUtils_1.annotateChildPods(kubectl, resource.type, resource.name, annotationKeyValStr, allPods)).forEach((execResult) => annotateResults.push(execResult));
            }
        }
        kubectlUtils_1.checkForErrors(annotateResults, true);
    });
}
function labelResources(files, kubectl, label) {
    return __awaiter(this, void 0, void 0, function* () {
        const labels = [
            `workflowFriendlyName=${githubUtils_1.normaliseWorkflowStrLabel(process.env.GITHUB_WORKFLOW)}`,
            `workflow=${label}`,
        ];
        kubectlUtils_1.checkForErrors([yield kubectl.labelFiles(files, labels)], true);
    });
}
