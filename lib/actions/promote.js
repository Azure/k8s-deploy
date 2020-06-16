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
const utils = require("../utilities/manifest-utilities");
const TaskInputParameters = require("../input-parameters");
const kubectl_object_model_1 = require("../kubectl-object-model");
function promote(ignoreSslErrors) {
    return __awaiter(this, void 0, void 0, function* () {
        const kubectl = new kubectl_object_model_1.Kubectl(yield utils.getKubectl(), TaskInputParameters.namespace, ignoreSslErrors);
        if (!canaryDeploymentHelper.isCanaryDeploymentStrategy()) {
            core.debug('Strategy is not canary deployment. Invalid request.');
            throw ('InvalidPromotetActionDeploymentStrategy');
        }
        let includeServices = false;
        if (canaryDeploymentHelper.isSMICanaryStrategy()) {
            includeServices = true;
            // In case of SMI traffic split strategy when deployment is promoted, first we will redirect traffic to
            // Canary deployment, then update stable deployment and then redirect traffic to stable deployment
            core.debug('Redirecting traffic to canary deployment');
            SMICanaryDeploymentHelper.redirectTrafficToCanaryDeployment(kubectl, TaskInputParameters.manifests);
            core.debug('Deploying input manifests with SMI canary strategy');
            yield deploymentHelper.deploy(kubectl, TaskInputParameters.manifests, 'None');
            core.debug('Redirecting traffic to stable deployment');
            SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(kubectl, TaskInputParameters.manifests);
        }
        else {
            core.debug('Deploying input manifests');
            yield deploymentHelper.deploy(kubectl, TaskInputParameters.manifests, 'None');
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
exports.promote = promote;
