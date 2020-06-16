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
function reject(ignoreSslErrors) {
    return __awaiter(this, void 0, void 0, function* () {
        const kubectl = new kubectl_object_model_1.Kubectl(yield utils.getKubectl(), TaskInputParameters.namespace, ignoreSslErrors);
        if (!canaryDeploymentHelper.isCanaryDeploymentStrategy()) {
            core.debug('Strategy is not canary deployment. Invalid request.');
            throw ('InvalidRejectActionDeploymentStrategy');
        }
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
exports.reject = reject;
