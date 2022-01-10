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
const KubernetesObjectUtility = require("../utilities/resource-object-utility");
const models = require("../constants");
const KubernetesConstants = require("../constants");
const manifest_utilities_1 = require("../utilities/manifest-utilities");
const blue_green_helper_1 = require("../utilities/strategy-helpers/blue-green-helper");
const deployment_helper_1 = require("../utilities/strategy-helpers/deployment-helper");
function deploy(manifestFilePaths, deploymentStrategy, kubectl) {
    return __awaiter(this, void 0, void 0, function* () {
        const inputManifestFiles = manifest_utilities_1.updateManifestFiles(manifestFilePaths);
        // deployment
        const deployedManifestFiles = deployment_helper_1.deployManifests(inputManifestFiles, deploymentStrategy, kubectl);
        // check manifest stability
        const resourceTypes = KubernetesObjectUtility.getResources(deployedManifestFiles, models.DEPLOYMENT_TYPES.concat([
            KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE,
        ]));
        yield deployment_helper_1.checkManifestStability(kubectl, resourceTypes);
        // route blue-green deployments
        if (blue_green_helper_1.isBlueGreenDeploymentStrategy()) {
            yield blue_green_helper_1.routeBlueGreen(kubectl, inputManifestFiles);
        }
        // print ingress resources
        const ingressResources = KubernetesObjectUtility.getResources(deployedManifestFiles, [KubernetesConstants.DiscoveryAndLoadBalancerResource.INGRESS]);
        ingressResources.forEach((ingressResource) => {
            kubectl.getResource(KubernetesConstants.DiscoveryAndLoadBalancerResource.INGRESS, ingressResource.name);
        });
        // annotate resources
        let allPods;
        try {
            allPods = JSON.parse(kubectl.getAllPods().stdout);
        }
        catch (e) {
            core.debug("Unable to parse pods; Error: " + e);
        }
        deployment_helper_1.annotateAndLabelResources(deployedManifestFiles, kubectl, resourceTypes, allPods);
    });
}
exports.deploy = deploy;
