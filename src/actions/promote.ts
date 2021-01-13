'use strict';

import * as core from '@actions/core';
import * as deploymentHelper from '../utilities/strategy-helpers/deployment-helper';
import * as canaryDeploymentHelper from '../utilities/strategy-helpers/canary-deployment-helper';
import * as SMICanaryDeploymentHelper from '../utilities/strategy-helpers/smi-canary-deployment-helper';
import * as utils from '../utilities/manifest-utilities';
import * as TaskInputParameters from '../input-parameters';
import { getUpdatedManifestFiles } from '../utilities/manifest-utilities'
import * as KubernetesObjectUtility from '../utilities/resource-object-utility';
import * as models from '../constants';
import * as KubernetesManifestUtility from '../utilities/manifest-stability-utility';
import { getManifestObjects, deleteWorkloadsWithLabel, deleteWorkloadsAndServicesWithLabel, BlueGreenManifests } from '../utilities/strategy-helpers/blue-green-helper';
import { isBlueGreenDeploymentStrategy, isIngressRoute, isSMIRoute, GREEN_LABEL_VALUE, NONE_LABEL_VALUE } from '../utilities/strategy-helpers/blue-green-helper';
import { routeBlueGreenService, promoteBlueGreenService } from '../utilities/strategy-helpers/service-blue-green-helper';
import { routeBlueGreenIngress, promoteBlueGreenIngress } from '../utilities/strategy-helpers/ingress-blue-green-helper';
import { routeBlueGreenSMI, promoteBlueGreenSMI, cleanupSMI } from '../utilities/strategy-helpers/smi-blue-green-helper';
import { Kubectl, Resource } from '../kubectl-object-model';
import { DeploymentConfig } from '../utilities/utility';

export async function promote(kubectl: Kubectl, deploymentConfig: DeploymentConfig) {
    if (canaryDeploymentHelper.isCanaryDeploymentStrategy()) {
        await promoteCanary(kubectl, deploymentConfig);
    } else if (isBlueGreenDeploymentStrategy()) {
        await promoteBlueGreen(kubectl);
    } else {
        core.debug('Strategy is not canary or blue-green deployment. Invalid request.');
        throw ('InvalidPromotetActionDeploymentStrategy');
    }
}

async function promoteCanary(kubectl: Kubectl, deploymentConfig: DeploymentConfig) {
    let includeServices = false;
    if (canaryDeploymentHelper.isSMICanaryStrategy()) {
        includeServices = true;
        // In case of SMI traffic split strategy when deployment is promoted, first we will redirect traffic to
        // Canary deployment, then update stable deployment and then redirect traffic to stable deployment
        core.debug('Redirecting traffic to canary deployment');
        SMICanaryDeploymentHelper.redirectTrafficToCanaryDeployment(kubectl, TaskInputParameters.manifests);

        core.debug('Deploying input manifests with SMI canary strategy');
        await deploymentHelper.deploy(kubectl, TaskInputParameters.manifests, 'None', deploymentConfig);

        core.debug('Redirecting traffic to stable deployment');
        SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(kubectl, TaskInputParameters.manifests);
    } else {
        core.debug('Deploying input manifests');
        await deploymentHelper.deploy(kubectl, TaskInputParameters.manifests, 'None', deploymentConfig);
    }

    core.debug('Deployment strategy selected is Canary. Deleting canary and baseline workloads.');
    try {
        canaryDeploymentHelper.deleteCanaryDeployment(kubectl, TaskInputParameters.manifests, includeServices);
    } catch (ex) {
        core.warning('Exception occurred while deleting canary and baseline workloads. Exception: ' + ex);
    }
}

async function promoteBlueGreen(kubectl: Kubectl) {
    // updated container images and pull secrets
    let inputManifestFiles: string[] = getUpdatedManifestFiles(TaskInputParameters.manifests);
    const manifestObjects: BlueGreenManifests = getManifestObjects(inputManifestFiles);

    core.debug('deleting old deployment and making new ones');
    let result;
    if (isIngressRoute()) {
        result = await promoteBlueGreenIngress(kubectl, manifestObjects);
    } else if (isSMIRoute()) {
        result = await promoteBlueGreenSMI(kubectl, manifestObjects);
    } else {
        result = await promoteBlueGreenService(kubectl, manifestObjects);
    }

    // checking stability of newly created deployments 
    const deployedManifestFiles = result.newFilePaths;
    const resources: Resource[] = KubernetesObjectUtility.getResources(deployedManifestFiles, models.deploymentTypes.concat([models.DiscoveryAndLoadBalancerResource.service]));
    await KubernetesManifestUtility.checkManifestStability(kubectl, resources);

    core.debug('routing to new deployments');
    if (isIngressRoute()) {
        routeBlueGreenIngress(kubectl, null, manifestObjects.serviceNameMap, manifestObjects.ingressEntityList);
        deleteWorkloadsAndServicesWithLabel(kubectl, GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
    } else if (isSMIRoute()) {
        routeBlueGreenSMI(kubectl, NONE_LABEL_VALUE, manifestObjects.serviceEntityList);
        deleteWorkloadsWithLabel(kubectl, GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
        cleanupSMI(kubectl, manifestObjects.serviceEntityList);
    } else {
        routeBlueGreenService(kubectl, NONE_LABEL_VALUE, manifestObjects.serviceEntityList);
        deleteWorkloadsWithLabel(kubectl, GREEN_LABEL_VALUE, manifestObjects.deploymentEntityList);
    }
}