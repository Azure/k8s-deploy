'use strict';
import * as core from '@actions/core';

import * as deploymentHelper from '../utilities/strategy-helpers/deployment-helper';
import * as canaryDeploymentHelper from '../utilities/strategy-helpers/canary-deployment-helper';
import * as SMICanaryDeploymentHelper from '../utilities/strategy-helpers/smi-canary-deployment-helper';
import * as utils from '../utilities/manifest-utilities';
import * as TaskInputParameters from '../input-parameters';

import { Kubectl } from '../kubectl-object-model';

export async function promote(ignoreSslErrors?: boolean) {
    const kubectl = new Kubectl(await utils.getKubectl(), TaskInputParameters.namespace, ignoreSslErrors, TaskInputParameters.forceDeployment)

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
        await deploymentHelper.deploy(kubectl, TaskInputParameters.manifests, 'None');

        core.debug('Redirecting traffic to stable deployment');
        SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(kubectl, TaskInputParameters.manifests);
    } else {
        core.debug('Deploying input manifests');
        await deploymentHelper.deploy(kubectl, TaskInputParameters.manifests, 'None');
    }

    core.debug('Deployment strategy selected is Canary. Deleting canary and baseline workloads.');
    try {
        canaryDeploymentHelper.deleteCanaryDeployment(kubectl, TaskInputParameters.manifests, includeServices);
    } catch (ex) {
        core.warning('Exception occurred while deleting canary and baseline workloads. Exception: ' + ex);
    }
}