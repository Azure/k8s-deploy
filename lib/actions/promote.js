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
exports.promote = void 0;
const core = require("@actions/core");
const deploymentHelper = require("../utilities/strategy-helpers/deployment-helper");
const canaryDeploymentHelper = require("../utilities/strategy-helpers/canary-deployment-helper");
const SMICanaryDeploymentHelper = require("../utilities/strategy-helpers/smi-canary-deployment-helper");
const TaskInputParameters = require("../input-parameters");
const manifest_utilities_1 = require("../utilities/manifest-utilities");
const KubernetesObjectUtility = require("../utilities/resource-object-utility");
const models = require("../constants");
const KubernetesManifestUtility = require("../utilities/manifest-stability-utility");
const blue_green_helper_1 = require("../utilities/strategy-helpers/blue-green-helper");
const blue_green_helper_2 = require("../utilities/strategy-helpers/blue-green-helper");
const service_blue_green_helper_1 = require("../utilities/strategy-helpers/service-blue-green-helper");
const ingress_blue_green_helper_1 = require("../utilities/strategy-helpers/ingress-blue-green-helper");
const smi_blue_green_helper_1 = require("../utilities/strategy-helpers/smi-blue-green-helper");
function promote(kubectl, deploymentConfig) {
    return __awaiter(this, void 0, void 0, function* () {
        if (canaryDeploymentHelper.isCanaryDeploymentStrategy()) {
            yield promoteCanary(kubectl, deploymentConfig);
        }
        else if (blue_green_helper_2.isBlueGreenDeploymentStrategy()) {
            yield promoteBlueGreen(kubectl);
        }
        else {
            core.debug('Strategy is not canary or blue-green deployment. Invalid request.');
            throw ('InvalidPromotetActionDeploymentStrategy');
        }
    });
}
exports.promote = promote;
function promoteCanary(kubectl, deploymentConfig) {
    return __awaiter(this, void 0, void 0, function* () {
        let includeServices = false;
        if (canaryDeploymentHelper.isSMICanaryStrategy()) {
            includeServices = true;
            // In case of SMI traffic split strategy when deployment is promoted, first we will redirect traffic to
            // Canary deployment, then update stable deployment and then redirect traffic to stable deployment
            core.debug('Redirecting traffic to canary deployment');
            SMICanaryDeploymentHelper.redirectTrafficToCanaryDeployment(kubectl, TaskInputParameters.manifests);
            core.debug('Deploying input manifests with SMI canary strategy');
            yield deploymentHelper.deploy(kubectl, TaskInputParameters.manifests, 'None', deploymentConfig);
            core.debug('Redirecting traffic to stable deployment');
            SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(kubectl, TaskInputParameters.manifests);
        }
        else {
            core.debug('Deploying input manifests');
            yield deploymentHelper.deploy(kubectl, TaskInputParameters.manifests, 'None', deploymentConfig);
        }
        core.debug('Deployment strategy selected is Canary. Deleting canary and baseline workloads.');
        try {
            canaryDeploymentHelper.deleteCanaryDeployment(kubectl, TaskInputParameters.manifests, includeServices);
        }
        catch (ex) {
            core.warning('Exception occurred while deleting canary and baseline workloads. Exception: ' + ex);
        }
    });
}
function promoteBlueGreen(kubectl) {
    return __awaiter(this, void 0, void 0, function* () {
        // updated container images and pull secrets
        let inputManifestFiles = manifest_utilities_1.getUpdatedManifestFiles(TaskInputParameters.manifests);
        const manifestObjects = blue_green_helper_1.getManifestObjects(inputManifestFiles);
        core.debug('deleting old deployment and making new ones');
        let result;
        if (blue_green_helper_2.isIngressRoute()) {
            result = yield ingress_blue_green_helper_1.promoteBlueGreenIngress(kubectl, manifestObjects);
        }
        else if (blue_green_helper_2.isSMIRoute()) {
            result = yield smi_blue_green_helper_1.promoteBlueGreenSMI(kubectl, manifestObjects);
        }
        else {
            result = yield service_blue_green_helper_1.promoteBlueGreenService(kubectl, manifestObjects);
        }
        // checking stability of newly created deployments 
        const deployedManifestFiles = result.newFilePaths;
        const resources = KubernetesObjectUtility.getResources(deployedManifestFiles, models.deploymentTypes.concat([models.DiscoveryAndLoadBalancerResource.service]));
        yield KubernetesManifestUtility.checkManifestStability(kubectl, resources);
        core.debug('routing to new deployments');
        if (blue_green_helper_2.isIngressRoute()) {
            ingress_blue_green_helper_1.routeBlueGreenIngress(kubectl, null, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);
            blue_green_helper_1.deleteWorkloadsAndServicesWithLabel(kubectl, blue_green_helper_2.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
        }
        else if (blue_green_helper_2.isSMIRoute()) {
            smi_blue_green_helper_1.routeBlueGreenSMI(kubectl, blue_green_helper_2.NONE_LABEL_VALUE, manifestObjects.serviceEntityList);
            blue_green_helper_1.deleteWorkloadsWithLabel(kubectl, blue_green_helper_2.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
            smi_blue_green_helper_1.cleanupSMI(kubectl, manifestObjects.serviceEntityList);
        }
        else {
            service_blue_green_helper_1.routeBlueGreenService(kubectl, blue_green_helper_2.NONE_LABEL_VALUE, manifestObjects.serviceEntityList);
            blue_green_helper_1.deleteWorkloadsWithLabel(kubectl, blue_green_helper_2.GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
        }
    });
}
