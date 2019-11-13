'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as tl from '@actions/core';
import * as yaml from 'js-yaml';
import * as canaryDeploymentHelper from './CanaryDeploymentHelper';
import * as KubernetesObjectUtility from './KubernetesObjectUtility';
import * as TaskInputParameters from '../input-parameters';
import * as models from '../kubernetesconstants';
import * as fileHelper from './FileHelper';
import * as utils from './utilities';
import * as KubernetesManifestUtility from '../kubernetes-manifest-utility';
import * as KubernetesConstants from '../kubernetesconstants';
// import { IExecSyncResult } from 'azure-pipelines-task-lib/toolrunner';
import { Kubectl, Resource } from '../kubectl-object-model';

import { deployPodCanary } from './PodCanaryDeploymentHelper';
import { deploySMICanary } from './SMICanaryDeploymentHelper';


export async function deploy(kubectl: Kubectl, manifestFilePaths: string[], deploymentStrategy: string) {

    // get manifest files
    let inputManifestFiles: string[] = getManifestFiles(manifestFilePaths);

    // artifact substitution
    inputManifestFiles = updateContainerImagesInManifestFiles(inputManifestFiles, TaskInputParameters.containers);

    // imagePullSecrets addition
    inputManifestFiles = updateImagePullSecretsInManifestFiles(inputManifestFiles, TaskInputParameters.imagePullSecrets);

    console.log("isCanary: ", isCanaryDeploymentStrategy(deploymentStrategy))
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
    utils.checkForErrors([result]);
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

function updateContainerImagesInManifestFiles(filePaths: string[], containers: string[]): string[] {
    if (!!containers && containers.length > 0) {
        const newFilePaths = [];
        const tempDirectory = fileHelper.getTempDirectory();
        filePaths.forEach((filePath: string) => {
            let contents = fs.readFileSync(filePath).toString();
            containers.forEach((container: string) => {
                let imageName = container.split(':')[0];
                if (imageName.indexOf('@') > 0) {
                    imageName = imageName.split('@')[0];
                }
                if (contents.indexOf(imageName) > 0) {
                    contents = utils.substituteImageNameInSpecFile(contents, imageName, container);
                }
            });

            const fileName = path.join(tempDirectory, path.basename(filePath));
            fs.writeFileSync(
                path.join(fileName),
                contents
            );
            newFilePaths.push(fileName);
        });

        return newFilePaths;
    }

    return filePaths;
}

function updateImagePullSecretsInManifestFiles(filePaths: string[], imagePullSecrets: string[]): string[] {
    if (!!imagePullSecrets && imagePullSecrets.length > 0) {
        const newObjectsList = [];
        filePaths.forEach((filePath: string) => {
            const fileContents = fs.readFileSync(filePath).toString();
            yaml.safeLoadAll(fileContents, function (inputObject: any) {
                if (!!inputObject && !!inputObject.kind) {
                    const kind = inputObject.kind;
                    if (KubernetesObjectUtility.isWorkloadEntity(kind)) {
                        KubernetesObjectUtility.updateImagePullSecrets(inputObject, imagePullSecrets, false);
                    }
                    newObjectsList.push(inputObject);
                }
            });
        });
        tl.debug('New K8s objects after addin imagePullSecrets are :' + JSON.stringify(newObjectsList));
        const newFilePaths = fileHelper.writeObjectsToFile(newObjectsList);
        return newFilePaths;
    }
    return filePaths;
}

function isCanaryDeploymentStrategy(deploymentStrategy: string): boolean {
    return deploymentStrategy != null && deploymentStrategy.toUpperCase() === canaryDeploymentHelper.CANARY_DEPLOYMENT_STRATEGY.toUpperCase();
}
