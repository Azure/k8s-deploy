'use strict';

import * as fs from 'fs';
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
import { deployPodCanary } from './pod-canary-deployment-helper';
import { deploySMICanary } from './smi-canary-deployment-helper';
import { checkForErrors, sleep } from "../utility";
import { BLUE_GREEN_NEW_LABEL_VALUE, getManifestObjects } from './blue-green-helper';
import { deployBlueGreen, blueGreenRouteService, isBlueGreenDeploymentStrategy } from './service-blue-green-helper';
import { deployBlueGreenIngress, blueGreenRouteIngress, isIngressRoute } from './ingress-blue-green-helper';
import { deployBlueGreenSMI, blueGreenRouteTraffic, isSMIRoute } from './smi-blue-green-helper';


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
}

async function routeBlueGreen(kubectl: Kubectl, inputManifestFiles: string[]) {
    // get buffer time
    let sleepTime: number = parseInt(TaskInputParameters.versionSwitchBuffer);

    //logging start of buffer time
    let temp = new Date();
    console.log('starting buffer time of '+sleepTime+' minute/s at '+temp.getHours()+':'+temp.getMinutes()+':'+temp.getSeconds()+' UTC');
    // waiting
    await sleep(sleepTime*1000*60);
    // logging end of buffer time
    temp = new Date();
    console.log('stopping buffer time of '+sleepTime+' minute/s at '+temp.getHours()+':'+temp.getMinutes()+':'+temp.getSeconds()+' UTC');
    
    const manifestObjects = getManifestObjects(inputManifestFiles);
    // routing to new deployments
    if (isIngressRoute()) {
        blueGreenRouteIngress(kubectl, BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.serviceNameMap, manifestObjects.serviceEntityList, manifestObjects.ingressEntityList);    
    } else if (isSMIRoute()) {
        blueGreenRouteTraffic(kubectl,  BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
    } else {
        blueGreenRouteService(kubectl, BLUE_GREEN_NEW_LABEL_VALUE, manifestObjects.deploymentEntityList, manifestObjects.serviceEntityList);
    }
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
            blueGreenDeploymentOutput = deployBlueGreen(kubectl, files);
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

function isCanaryDeploymentStrategy(deploymentStrategy: string): boolean {
    return deploymentStrategy != null && deploymentStrategy.toUpperCase() === canaryDeploymentHelper.CANARY_DEPLOYMENT_STRATEGY.toUpperCase();
}
