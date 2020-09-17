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
exports.reject = void 0;
const core = require("@actions/core");
const canaryDeploymentHelper = require("../utilities/strategy-helpers/canary-deployment-helper");
const SMICanaryDeploymentHelper = require("../utilities/strategy-helpers/smi-canary-deployment-helper");
const kubectl_object_model_1 = require("../kubectl-object-model");
const utils = require("../utilities/manifest-utilities");
const TaskInputParameters = require("../input-parameters");
const service_blue_green_helper_1 = require("../utilities/strategy-helpers/service-blue-green-helper");
const ingress_blue_green_helper_1 = require("../utilities/strategy-helpers/ingress-blue-green-helper");
const smi_blue_green_helper_1 = require("../utilities/strategy-helpers/smi-blue-green-helper");
const blue_green_helper_1 = require("../utilities/strategy-helpers/blue-green-helper");
const deployment_helper_1 = require("../utilities/strategy-helpers/deployment-helper");
function reject() {
    return __awaiter(this, void 0, void 0, function* () {
        const kubectl = new kubectl_object_model_1.Kubectl(yield utils.getKubectl(), TaskInputParameters.namespace, true);
        if (canaryDeploymentHelper.isCanaryDeploymentStrategy()) {
            yield rejectCanary(kubectl);
        }
        else if (blue_green_helper_1.isBlueGreenDeploymentStrategy()) {
            yield rejectBlueGreen(kubectl);
        }
        else {
            core.debug('Strategy is not canary or blue-green deployment. Invalid request.');
            throw ('InvalidDeletetActionDeploymentStrategy');
        }
    });
}
exports.reject = reject;
function rejectCanary(kubectl) {
    return __awaiter(this, void 0, void 0, function* () {
        let includeServices = false;
        if (canaryDeploymentHelper.isSMICanaryStrategy()) {
            core.debug('Reject deployment with SMI canary strategy');
            includeServices = true;
            SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(kubectl, TaskInputParameters.manifests);
        }
        core.debug('Deployment strategy selected is Canary. Deleting baseline and canary workloads.');
        canaryDeploymentHelper.deleteCanaryDeployment(kubectl, TaskInputParameters.manifests, includeServices);
    });
}
function rejectBlueGreen(kubectl) {
    return __awaiter(this, void 0, void 0, function* () {
        let inputManifestFiles = deployment_helper_1.getManifestFiles(TaskInputParameters.manifests);
        if (blue_green_helper_1.isIngressRoute()) {
            yield ingress_blue_green_helper_1.rejectBlueGreenIngress(kubectl, inputManifestFiles);
        }
        else if (blue_green_helper_1.isSMIRoute()) {
            yield smi_blue_green_helper_1.rejectBlueGreenSMI(kubectl, inputManifestFiles);
        }
        else {
            yield service_blue_green_helper_1.rejectBlueGreenService(kubectl, inputManifestFiles);
        }
    });
}
