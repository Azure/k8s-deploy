'use strict';
import * as core from '@actions/core';
import * as canaryDeploymentHelper from '../utilities/strategy-helpers/canary-deployment-helper';
import * as SMICanaryDeploymentHelper from '../utilities/strategy-helpers/smi-canary-deployment-helper';
import { Kubectl } from '../kubectl-object-model';
import * as utils from '../utilities/manifest-utilities';
import * as TaskInputParameters from '../input-parameters';
import { isBlueGreenDeploymentStrategy, blueGreenReject } from '../utilities/strategy-helpers/service-blue-green-helper';
import { isIngressRoute ,blueGreenRejectIngress } from '../utilities/strategy-helpers/ingress-blue-green-helper';
import { isSMIRoute, blueGreenRejectSMI} from '../utilities/strategy-helpers/smi-blue-green-helper'
import { getManifestFiles } from '../utilities/strategy-helpers/deployment-helper'

export async function reject() {
    const kubectl = new Kubectl(await utils.getKubectl(), TaskInputParameters.namespace, true);

    if (canaryDeploymentHelper.isCanaryDeploymentStrategy()) {
        await rejectCanary(kubectl);
    } else if (isBlueGreenDeploymentStrategy()) {
        await rejectBlueGreen(kubectl);
    } else {
        core.debug('Strategy is not canary or blue-green deployment. Invalid request.');
        throw ('InvalidDeletetActionDeploymentStrategy');
    }
}

async function rejectCanary(kubectl: Kubectl) {
    let includeServices = false;
    if (canaryDeploymentHelper.isSMICanaryStrategy()) {
        core.debug('Reject deployment with SMI canary strategy');
        includeServices = true;
        SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(kubectl, TaskInputParameters.manifests);
    }

    core.debug('Deployment strategy selected is Canary. Deleting baseline and canary workloads.');
    canaryDeploymentHelper.deleteCanaryDeployment(kubectl, TaskInputParameters.manifests, includeServices);
}

async function rejectBlueGreen(kubectl: Kubectl) {
    let inputManifestFiles: string[] = getManifestFiles(TaskInputParameters.manifests);
    if(isIngressRoute()) {
        await blueGreenRejectIngress(kubectl, inputManifestFiles);
    } else if (isSMIRoute()) {
        await blueGreenRejectSMI(kubectl, inputManifestFiles);
    } else {
        await blueGreenReject(kubectl, inputManifestFiles);
    }
}