'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import * as yaml from 'js-yaml';
import * as canaryDeploymentHelper from './canary-deployment-helper';
import * as KubernetesObjectUtility from '../resource-object-utility';
import * as TaskInputParameters from '../../input-parameters';
import * as models from '../../constants';
import * as fileHelper from '../files-helper';
import * as utils from '../manifest-utilities';
import * as KubernetesManifestUtility from '../manifest-stability-utility';
import * as KubernetesConstants from '../../constants';
import { Kubectl, Resource } from '../../kubectl-object-model';

import { deployPodCanary } from './pod-canary-deployment-helper';
import { deploySMICanary } from './smi-canary-deployment-helper';
import { checkForErrors } from "../utility";
import { isEqual, StringComparer } from '../string-comparison';


export async function deploy(kubectl: Kubectl, manifestFilePaths: string[], deploymentStrategy: string) {

    // get manifest files
    let inputManifestFiles: string[] = getManifestFiles(manifestFilePaths);


    // imagePullSecrets addition
    inputManifestFiles = updateResourcesObjects(inputManifestFiles, TaskInputParameters.imagePullSecrets, TaskInputParameters.containers);

    // deployment
    const deployedManifestFiles = deployManifests(inputManifestFiles, kubectl, isCanaryDeploymentStrategy(deploymentStrategy));

    // check manifest stability
    const resourceTypes: Resource[] = KubernetesObjectUtility.getResources(deployedManifestFiles, models.deploymentTypes.concat([KubernetesConstants.DiscoveryAndLoadBalancerResource.service]));
    await checkManifestStability(kubectl, resourceTypes);

    // print ingress resources
    const ingressResources: Resource[] = KubernetesObjectUtility.getResources(deployedManifestFiles, [KubernetesConstants.DiscoveryAndLoadBalancerResource.ingress]);
    ingressResources.forEach(ingressResource => {
        kubectl.getResource(KubernetesConstants.DiscoveryAndLoadBalancerResource.ingress, ingressResource.name);
    });
}

function getManifestFiles(manifestFilePaths: string[]): string[] {
    const files: string[] = utils.getManifestFiles(manifestFilePaths);

    if (files == null || files.length === 0) {
        throw new Error(`ManifestFileNotFound : ${manifestFilePaths}`);
    }

    return files;
}

function deployManifests(files: string[], kubectl: Kubectl, isCanaryDeploymentStrategy: boolean): string[] {
    let result;
    if (isCanaryDeploymentStrategy) {
        let canaryDeploymentOutput: any;
        if (canaryDeploymentHelper.isSMICanaryStrategy()) {
            canaryDeploymentOutput = deploySMICanary(kubectl, files);
        } else {
            canaryDeploymentOutput = deployPodCanary(kubectl, files);
        }
        result = canaryDeploymentOutput.result;
        files = canaryDeploymentOutput.newFilePaths;
    } else {
        if (canaryDeploymentHelper.isSMICanaryStrategy()) {
            const updatedManifests = appendStableVersionLabelToResource(files, kubectl);
            result = kubectl.apply(updatedManifests);
        }
        else {
            result = kubectl.apply(files);
        }
    }
    checkForErrors([result]);
    return files;
}

function appendStableVersionLabelToResource(files: string[], kubectl: Kubectl): string[] {
    const manifestFiles = [];
    const newObjectsList = [];

    files.forEach((filePath: string) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const kind = inputObject.kind;
            if (KubernetesObjectUtility.isDeploymentEntity(kind)) {
                const updatedObject = canaryDeploymentHelper.markResourceAsStable(inputObject);
                newObjectsList.push(updatedObject);
            } else {
                manifestFiles.push(filePath);
            }
        });
    });

    const updatedManifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    manifestFiles.push(...updatedManifestFiles);
    return manifestFiles;
}

async function checkManifestStability(kubectl: Kubectl, resources: Resource[]): Promise<void> {
    await KubernetesManifestUtility.checkManifestStability(kubectl, resources);
}

function updateResourcesObjects(filePaths: string[], imagePullSecrets: string[], containers: string[]): string[] {
    const newObjectsList = [];
    const updateResourceObject = (inputObject) => {
        if (!!imagePullSecrets && imagePullSecrets.length > 0) {
            KubernetesObjectUtility.updateImagePullSecrets(inputObject, imagePullSecrets, false);
        }
        if (!!containers && containers.length > 0) {
            KubernetesObjectUtility.updateImageDetails(inputObject, containers);
        }
    }

    filePaths.forEach((filePath: string) => {
        const fileContents = fs.readFileSync(filePath).toString();
        yaml.safeLoadAll(fileContents, function (inputObject: any) {
            if (!!inputObject && !!inputObject.kind) {
                const kind = inputObject.kind;
                if (KubernetesObjectUtility.isWorkloadEntity(kind)) {
                    updateResourceObject(inputObject);
                }
                else if (isEqual(kind, 'list', StringComparer.OrdinalIgnoreCase)) {
                    let items = inputObject.items;
                    if (items.length > 0) {
                        items.forEach((item) => updateResourceObject(item));
                    }
                }
                newObjectsList.push(inputObject);
            }
        });
    });
    return filePaths;
}

function isCanaryDeploymentStrategy(deploymentStrategy: string): boolean {
    return deploymentStrategy != null && deploymentStrategy.toUpperCase() === canaryDeploymentHelper.CANARY_DEPLOYMENT_STRATEGY.toUpperCase();
}
