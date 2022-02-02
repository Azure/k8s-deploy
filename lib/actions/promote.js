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
exports.promote = void 0;
const core = require("@actions/core");
const deploy = require("./deploy");
const canaryDeploymentHelper = require("../strategyHelpers/canary/canaryHelper");
const SMICanaryDeploymentHelper = require("../strategyHelpers/canary/smiCanaryHelper");
const manifestUpdateUtils_1 = require("../utilities/manifestUpdateUtils");
const models = require("../types/kubernetesTypes");
const KubernetesManifestUtility = require("../utilities/manifestStabilityUtils");
const blueGreenHelper_1 = require("../strategyHelpers/blueGreen/blueGreenHelper");
const serviceBlueGreenHelper_1 = require("../strategyHelpers/blueGreen/serviceBlueGreenHelper");
const ingressBlueGreenHelper_1 = require("../strategyHelpers/blueGreen/ingressBlueGreenHelper");
const smiBlueGreenHelper_1 = require("../strategyHelpers/blueGreen/smiBlueGreenHelper");
const deploymentStrategy_1 = require("../types/deploymentStrategy");
const trafficSplitMethod_1 = require("../types/trafficSplitMethod");
const routeStrategy_1 = require("../types/routeStrategy");
function promote(kubectl, manifests, deploymentStrategy) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (deploymentStrategy) {
            case deploymentStrategy_1.DeploymentStrategy.CANARY:
                yield promoteCanary(kubectl, manifests);
                break;
            case deploymentStrategy_1.DeploymentStrategy.BLUE_GREEN:
                yield promoteBlueGreen(kubectl, manifests);
                break;
            default:
                throw Error("Invalid promote deployment strategy");
        }
    });
}
exports.promote = promote;
function promoteCanary(kubectl, manifests) {
    return __awaiter(this, void 0, void 0, function* () {
        let includeServices = false;
        const trafficSplitMethod = trafficSplitMethod_1.parseTrafficSplitMethod(core.getInput("traffic-split-method", { required: true }));
        if (trafficSplitMethod == trafficSplitMethod_1.TrafficSplitMethod.SMI) {
            includeServices = true;
            // In case of SMI traffic split strategy when deployment is promoted, first we will redirect traffic to
            // canary deployment, then update stable deployment and then redirect traffic to stable deployment
            core.info("Redirecting traffic to canary deployment");
            yield SMICanaryDeploymentHelper.redirectTrafficToCanaryDeployment(kubectl, manifests);
            core.info("Deploying input manifests with SMI canary strategy");
            yield deploy.deploy(kubectl, manifests, deploymentStrategy_1.DeploymentStrategy.CANARY);
            core.info("Redirecting traffic to stable deployment");
            yield SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(kubectl, manifests);
        }
        else {
            core.info("Deploying input manifests");
            yield deploy.deploy(kubectl, manifests, deploymentStrategy_1.DeploymentStrategy.CANARY);
        }
        core.info("Deleting canary and baseline workloads");
        try {
            yield canaryDeploymentHelper.deleteCanaryDeployment(kubectl, manifests, includeServices);
        }
        catch (ex) {
            core.warning("Exception occurred while deleting canary and baseline workloads: " + ex);
        }
    });
}
function promoteBlueGreen(kubectl, manifests) {
    return __awaiter(this, void 0, void 0, function* () {
        // update container images and pull secrets
        const inputManifestFiles = manifestUpdateUtils_1.updateManifestFiles(manifests);
        const manifestObjects = blueGreenHelper_1.getManifestObjects(inputManifestFiles);
        const routeStrategy = routeStrategy_1.parseRouteStrategy(core.getInput("route-method", { required: true }));
        core.info("Deleting old deployment and making new one");
        let result;
        if (routeStrategy == routeStrategy_1.RouteStrategy.INGRESS) {
            result = yield ingressBlueGreenHelper_1.promoteBlueGreenIngress(kubectl, manifestObjects);
        }
        else if (routeStrategy == routeStrategy_1.RouteStrategy.SMI) {
            result = yield smiBlueGreenHelper_1.promoteBlueGreenSMI(kubectl, manifestObjects);
        }
        else {
            result = yield serviceBlueGreenHelper_1.promoteBlueGreenService(kubectl, manifestObjects);
        }
        // checking stability of newly created deployments
        core.info("Checking manifest stability");
        const deployedManifestFiles = result.newFilePaths;
        const resources = manifestUpdateUtils_1.getResources(deployedManifestFiles, models.DEPLOYMENT_TYPES.concat([
            models.DiscoveryAndLoadBalancerResource.SERVICE,
        ]));
        yield KubernetesManifestUtility.checkManifestStability(kubectl, resources);
        core.info("Routing to new deployments and deleting old workloads and services");
        if (routeStrategy == routeStrategy_1.RouteStrategy.INGRESS) {
            yield ingressBlueGreenHelper_1.routeBlueGreenIngress(kubectl, null, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);
            yield blueGreenHelper_1.deleteWorkloadsAndServicesWithLabel(kubectl, blueGreenHelper_1.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
        }
        else if (routeStrategy == routeStrategy_1.RouteStrategy.SMI) {
            yield smiBlueGreenHelper_1.routeBlueGreenSMI(kubectl, blueGreenHelper_1.NONE_LABEL_VALUE, manifestObjects.serviceEntityList);
            yield blueGreenHelper_1.deleteWorkloadsWithLabel(kubectl, blueGreenHelper_1.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
            yield smiBlueGreenHelper_1.cleanupSMI(kubectl, manifestObjects.serviceEntityList);
        }
        else {
            yield serviceBlueGreenHelper_1.routeBlueGreenService(kubectl, blueGreenHelper_1.NONE_LABEL_VALUE, manifestObjects.serviceEntityList);
            yield blueGreenHelper_1.deleteWorkloadsWithLabel(kubectl, blueGreenHelper_1.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
        }
    });
}
