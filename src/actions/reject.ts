'use strict';
import * as core from '@actions/core';
import * as canaryDeploymentHelper from '../utilities/strategy-helpers/canary-deployment-helper';
import * as SMICanaryDeploymentHelper from '../utilities/strategy-helpers/smi-canary-deployment-helper';
import { Kubectl } from '../kubectl-object-model';
import * as TaskInputParameters from '../input-parameters';
import { rejectBlueGreenService } from '../utilities/strategy-helpers/service-blue-green-helper';
import { rejectBlueGreenIngress } from '../utilities/strategy-helpers/ingress-blue-green-helper';
import { rejectBlueGreenSMI } from '../utilities/strategy-helpers/smi-blue-green-helper'
import { isSMIRoute, isIngressRoute, isBlueGreenDeploymentStrategy } from '../utilities/strategy-helpers/blue-green-helper'
import { getManifestFiles } from '../utilities/strategy-helpers/deployment-helper'

export async function reject(kubectl: Kubectl) {
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
    if (isIngressRoute()) {
        await rejectBlueGreenIngress(kubectl, inputManifestFiles);
    } else if (isSMIRoute()) {
        await rejectBlueGreenSMI(kubectl, inputManifestFiles);
    } else {
        await rejectBlueGreenService(kubectl, inputManifestFiles);
    }
}