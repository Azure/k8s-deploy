'use strict';

import * as fs from 'fs';
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
import { getUpdatedManifestFiles } from '../manifest-utilities';
import { IExecSyncResult } from '../../utilities/tool-runner';

import { deployPodCanary } from './pod-canary-deployment-helper';
import { deploySMICanary } from './smi-canary-deployment-helper';
import { checkForErrors, annotateChildPods, getWorkflowFilePath, getLastSuccessfulRunSha, getFilePathsConfigs } from "../utility";
import { isBlueGreenDeploymentStrategy, isIngressRoute, isSMIRoute, routeBlueGreen } from './blue-green-helper';
import { deployBlueGreenService } from './service-blue-green-helper';
import { deployBlueGreenIngress } from './ingress-blue-green-helper';
import { deployBlueGreenSMI } from './smi-blue-green-helper';

export async function deploy(kubectl: Kubectl, manifestFilePaths: string[], deploymentStrategy: string) {

    // get manifest files
    let inputManifestFiles: string[] = getUpdatedManifestFiles(manifestFilePaths);

    // deployment
    const deployedManifestFiles = deployManifests(inputManifestFiles, kubectl, isCanaryDeploymentStrategy(deploymentStrategy), isBlueGreenDeploymentStrategy());

    // check manifest stability
    const resourceTypes: Resource[] = KubernetesObjectUtility.getResources(deployedManifestFiles, models.deploymentTypes.concat([KubernetesConstants.DiscoveryAndLoadBalancerResource.service]));
    await checkManifestStability(kubectl, resourceTypes);

    // route blue-green deployments
    if (isBlueGreenDeploymentStrategy()) {
        await routeBlueGreen(kubectl, inputManifestFiles);
    }

    // print ingress resources
    const ingressResources: Resource[] = KubernetesObjectUtility.getResources(deployedManifestFiles, [KubernetesConstants.DiscoveryAndLoadBalancerResource.ingress]);
    ingressResources.forEach(ingressResource => {
        kubectl.getResource(KubernetesConstants.DiscoveryAndLoadBalancerResource.ingress, ingressResource.name);
    });
    
    // annotate resources
    let allPods: any;
    try {
        allPods = JSON.parse((kubectl.getAllPods()).stdout);
    } catch (e) {
        core.debug("Unable to parse pods; Error: " + e);
    }

    annotateAndLabelResources(deployedManifestFiles, kubectl, resourceTypes, allPods, manifestFilePaths);
}

export function getManifestFiles(manifestFilePaths: string[]): string[] {
    const files: string[] = utils.getManifestFiles(manifestFilePaths);

    if (files == null || files.length === 0) {
        throw new Error(`ManifestFileNotFound : ${manifestFilePaths}`);
    }

    return files;
}

function deployManifests(files: string[], kubectl: Kubectl, isCanaryDeploymentStrategy: boolean, isBlueGreenDeploymentStrategy: boolean): string[] {
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
    } else if (isBlueGreenDeploymentStrategy) {
        let blueGreenDeploymentOutput: any; 
        if (isIngressRoute()) {
            blueGreenDeploymentOutput = deployBlueGreenIngress(kubectl, files);
        } else if (isSMIRoute()) {
            blueGreenDeploymentOutput = deployBlueGreenSMI(kubectl, files);
        } else {
            blueGreenDeploymentOutput = deployBlueGreenService(kubectl, files);
        }
        result = blueGreenDeploymentOutput.result;
        files = blueGreenDeploymentOutput.newFilePaths;
    } else {
        if (canaryDeploymentHelper.isSMICanaryStrategy()) {
            const updatedManifests = appendStableVersionLabelToResource(files, kubectl);
            result = kubectl.apply(updatedManifests, TaskInputParameters.forceDeployment);
        }
        else {
            result = kubectl.apply(files, TaskInputParameters.forceDeployment);
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

async function annotateAndLabelResources(files: string[], kubectl: Kubectl, resourceTypes: Resource[], allPods: any, inputManifestFiles: string[]) {
    const workflowFilePath = await getWorkflowFilePath(TaskInputParameters.githubToken);
    const buildConfigs = await getFilePathsConfigs(inputManifestFiles);
    const annotationKeyLabel = models.getWorkflowAnnotationKeyLabel(workflowFilePath);
    annotateResources(files, kubectl, resourceTypes, allPods, annotationKeyLabel, workflowFilePath, buildConfigs);
    labelResources(files, kubectl, annotationKeyLabel);
}

function annotateResources(files: string[], kubectl: Kubectl, resourceTypes: Resource[], allPods: any, annotationKey: string, workflowFilePath: string, buildConfigs: any) {
    const annotateResults: IExecSyncResult[] = [];
    const lastSuccessSha = getLastSuccessfulRunSha(kubectl, TaskInputParameters.namespace, annotationKey);
    let annotationKeyValStr = annotationKey + '=' + models.getWorkflowAnnotationsJson(lastSuccessSha, workflowFilePath, buildConfigs);
    annotateResults.push(kubectl.annotate('namespace', TaskInputParameters.namespace, annotationKeyValStr));
    annotateResults.push(kubectl.annotateFiles(files, annotationKeyValStr));
    resourceTypes.forEach(resource => {
        if (resource.type.toUpperCase() !== models.KubernetesWorkload.pod.toUpperCase()) {
            annotateChildPods(kubectl, resource.type, resource.name, annotationKeyValStr, allPods)
                .forEach(execResult => annotateResults.push(execResult));
        }
    });
    checkForErrors(annotateResults, true);
}

function labelResources(files: string[], kubectl: Kubectl, label: string) {
    let workflowName = process.env.GITHUB_WORKFLOW;
    workflowName = workflowName.startsWith('.github/workflows/') ?
        workflowName.replace(".github/workflows/", "") : workflowName;
    const labels = [`workflowFriendlyName=${workflowName}`, `workflow=${label}`];
    checkForErrors([kubectl.labelFiles(files, labels)], true);
}

function isCanaryDeploymentStrategy(deploymentStrategy: string): boolean {
    return deploymentStrategy != null && deploymentStrategy.toUpperCase() === canaryDeploymentHelper.CANARY_DEPLOYMENT_STRATEGY.toUpperCase();
}
