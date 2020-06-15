'use strict';
import * as core from '@actions/core';
import * as canaryDeploymentHelper from '../utilities/strategy-helpers/canary-deployment-helper';
import * as SMICanaryDeploymentHelper from '../utilities/strategy-helpers/smi-canary-deployment-helper';
import { Kubectl } from '../kubectl-object-model';
import * as utils from '../utilities/manifest-utilities';
import * as TaskInputParameters from '../input-parameters';

export async function reject(ignoreSslErrors?: boolean) {
    const kubectl = new Kubectl(await utils.getKubectl(), TaskInputParameters.namespace, ignoreSslErrors, TaskInputParameters.forceDeployment)

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
}