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
exports.deploy = void 0;
const core = require("@actions/core");
const models = require("../types/kubernetesTypes");
const KubernetesConstants = require("../types/kubernetesTypes");
const manifestUpdateUtils_1 = require("../utilities/manifestUpdateUtils");
const blueGreenHelper_1 = require("../strategyHelpers/blueGreen/blueGreenHelper");
const deploymentHelper_1 = require("../strategyHelpers/deploymentHelper");
const deploymentStrategy_1 = require("../types/deploymentStrategy");
const trafficSplitMethod_1 = require("../types/trafficSplitMethod");
const routeStrategy_1 = require("../types/routeStrategy");
function deploy(kubectl, manifestFilePaths, deploymentStrategy) {
    return __awaiter(this, void 0, void 0, function* () {
        // update manifests
        const inputManifestFiles = manifestUpdateUtils_1.updateManifestFiles(manifestFilePaths);
        core.debug("Input manifest files: " + inputManifestFiles);
        // deploy manifests
        core.info("Deploying manifests");
        const trafficSplitMethod = trafficSplitMethod_1.parseTrafficSplitMethod(core.getInput("traffic-split-method", { required: true }));
        const deployedManifestFiles = yield deploymentHelper_1.deployManifests(inputManifestFiles, deploymentStrategy, kubectl, trafficSplitMethod);
        core.debug("Deployed manifest files: " + deployedManifestFiles);
        // check manifest stability
        core.info("Checking manifest stability");
        const resourceTypes = manifestUpdateUtils_1.getResources(deployedManifestFiles, models.DEPLOYMENT_TYPES.concat([
            KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE,
        ]));
        yield deploymentHelper_1.checkManifestStability(kubectl, resourceTypes);
        if (deploymentStrategy == deploymentStrategy_1.DeploymentStrategy.BLUE_GREEN) {
            core.info("Routing blue green");
            const routeStrategy = routeStrategy_1.parseRouteStrategy(core.getInput("route-method", { required: true }));
            yield blueGreenHelper_1.routeBlueGreen(kubectl, inputManifestFiles, routeStrategy);
        }
        // print ingresses
        core.info("Printing ingresses");
        const ingressResources = manifestUpdateUtils_1.getResources(deployedManifestFiles, [
            KubernetesConstants.DiscoveryAndLoadBalancerResource.INGRESS,
        ]);
        for (const ingressResource of ingressResources) {
            yield kubectl.getResource(KubernetesConstants.DiscoveryAndLoadBalancerResource.INGRESS, ingressResource.name);
        }
        // annotate resources
        core.info("Annotating resources");
        let allPods;
        try {
            allPods = JSON.parse((yield kubectl.getAllPods()).stdout);
        }
        catch (e) {
            core.debug("Unable to parse pods: " + e);
        }
        yield deploymentHelper_1.annotateAndLabelResources(deployedManifestFiles, kubectl, resourceTypes, allPods);
    });
}
exports.deploy = deploy;
