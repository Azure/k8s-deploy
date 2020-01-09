'use strict';

import { Kubectl } from '../../kubectl-object-model';
import * as core from '@actions/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as util from 'util';

import * as TaskInputParameters from '../../input-parameters';
import * as fileHelper from '../files-helper';
import * as helper from '../resource-object-utility';
import * as utils from '../manifest-utilities';
import * as kubectlUtils from '../../kubectl-util';
import * as canaryDeploymentHelper from './canary-deployment-helper';
import { checkForErrors } from "../utility";

const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = '-workflow-rollout';
const TRAFFIC_SPLIT_OBJECT = 'TrafficSplit';
var trafficSplitAPIVersion = null;

export function deploySMICanary(kubectl: Kubectl, filePaths: string[]) {
    const newObjectsList = [];
    const canaryReplicaCount = parseInt(TaskInputParameters.baselineAndCanaryReplicas);
    core.debug('Replica count is ' + canaryReplicaCount);

    filePaths.forEach((filePath: string) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (helper.isDeploymentEntity(kind)) {
                // Get stable object
                core.debug('Querying stable object');
                const stableObject = canaryDeploymentHelper.fetchResource(kubectl, kind, name);
                if (!stableObject) {
                    core.debug('Stable object not found. Creating only canary object');
                    // If stable object not found, create canary deployment.
                    const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(inputObject, canaryReplicaCount);
                    core.debug('New canary object is: ' + JSON.stringify(newCanaryObject));
                    newObjectsList.push(newCanaryObject);
                } else {
                    if (!canaryDeploymentHelper.isResourceMarkedAsStable(stableObject)) {
                        throw (`StableSpecSelectorNotExist : ${name}`);
                    }

                    core.debug('Stable object found. Creating canary and baseline objects');
                    // If canary object not found, create canary and baseline object.
                    const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(inputObject, canaryReplicaCount);
                    const newBaselineObject = canaryDeploymentHelper.getNewBaselineResource(stableObject, canaryReplicaCount);
                    core.debug('New canary object is: ' + JSON.stringify(newCanaryObject));
                    core.debug('New baseline object is: ' + JSON.stringify(newBaselineObject));
                    newObjectsList.push(newCanaryObject);
                    newObjectsList.push(newBaselineObject);
                }
            } else {
                // Updating non deployment entity as it is.
                newObjectsList.push(inputObject);
            }
        });
    });

    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    const result = kubectl.apply(manifestFiles);
    createCanaryService(kubectl, filePaths);
    return { 'result': result, 'newFilePaths': manifestFiles };
}

function createCanaryService(kubectl: Kubectl, filePaths: string[]) {
    const newObjectsList = [];
    const trafficObjectsList = [];

    filePaths.forEach((filePath: string) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {

            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (helper.isServiceEntity(kind)) {
                const newCanaryServiceObject = canaryDeploymentHelper.getNewCanaryResource(inputObject);
                core.debug('New canary service object is: ' + JSON.stringify(newCanaryServiceObject));
                newObjectsList.push(newCanaryServiceObject);

                const newBaselineServiceObject = canaryDeploymentHelper.getNewBaselineResource(inputObject);
                core.debug('New baseline object is: ' + JSON.stringify(newBaselineServiceObject));
                newObjectsList.push(newBaselineServiceObject);

                core.debug('Querying for stable service object');
                const stableObject = canaryDeploymentHelper.fetchResource(kubectl, kind, canaryDeploymentHelper.getStableResourceName(name));
                if (!stableObject) {
                    const newStableServiceObject = canaryDeploymentHelper.getStableResource(inputObject);
                    core.debug('New stable service object is: ' + JSON.stringify(newStableServiceObject));
                    newObjectsList.push(newStableServiceObject);

                    core.debug('Creating the traffic object for service: ' + name);
                    const trafficObject = createTrafficSplitManifestFile(kubectl, name, 0, 0, 1000);
                    core.debug('Creating the traffic object for service: ' + trafficObject);
                    trafficObjectsList.push(trafficObject);
                } else {
                    let updateTrafficObject = true;
                    const trafficObject = canaryDeploymentHelper.fetchResource(kubectl, TRAFFIC_SPLIT_OBJECT, getTrafficSplitResourceName(name));
                    if (trafficObject) {
                        const trafficJObject = JSON.parse(JSON.stringify(trafficObject));
                        if (trafficJObject && trafficJObject.spec && trafficJObject.spec.backends) {
                            trafficJObject.spec.backends.forEach((s) => {
                                if (s.service === canaryDeploymentHelper.getCanaryResourceName(name) && s.weight === "1000m") {
                                    core.debug('Update traffic objcet not required');
                                    updateTrafficObject = false;
                                }
                            })
                        }
                    }

                    if (updateTrafficObject) {
                        core.debug('Stable service object present so updating the traffic object for service: ' + name);
                        trafficObjectsList.push(updateTrafficSplitObject(kubectl, name));
                    }
                }
            }
        });
    });

    const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
    manifestFiles.push(...trafficObjectsList);
    const result = kubectl.apply(manifestFiles);
    checkForErrors([result]);
}

export function redirectTrafficToCanaryDeployment(kubectl: Kubectl, manifestFilePaths: string[]) {
    adjustTraffic(kubectl, manifestFilePaths, 0, 1000);
}

export function redirectTrafficToStableDeployment(kubectl: Kubectl, manifestFilePaths: string[]) {
    adjustTraffic(kubectl, manifestFilePaths, 1000, 0);
}

function adjustTraffic(kubectl: Kubectl, manifestFilePaths: string[], stableWeight: number, canaryWeight: number) {
    // get manifest files
    const inputManifestFiles: string[] = utils.getManifestFiles(manifestFilePaths);

    if (inputManifestFiles == null || inputManifestFiles.length == 0) {
        return;
    }

    const trafficSplitManifests = [];
    const serviceObjects = [];
    inputManifestFiles.forEach((filePath: string) => {
        const fileContents = fs.readFileSync(filePath);
        yaml.safeLoadAll(fileContents, function (inputObject) {
            const name = inputObject.metadata.name;
            const kind = inputObject.kind;
            if (helper.isServiceEntity(kind)) {
                trafficSplitManifests.push(createTrafficSplitManifestFile(kubectl, name, stableWeight, 0, canaryWeight));
                serviceObjects.push(name);
            }
        });
    });

    if (trafficSplitManifests.length <= 0) {
        return;
    }

    const result = kubectl.apply(trafficSplitManifests);
    core.debug('serviceObjects:' + serviceObjects.join(',') + ' result:' + result);
    checkForErrors([result]);
}

function updateTrafficSplitObject(kubectl: Kubectl, serviceName: string): string {
    const percentage = parseInt(TaskInputParameters.canaryPercentage) * 10;
    const baselineAndCanaryWeight = percentage / 2;
    const stableDeploymentWeight = 1000 - percentage;
    core.debug('Creating the traffic object with canary weight: ' + baselineAndCanaryWeight + ',baseling weight: ' + baselineAndCanaryWeight + ',stable: ' + stableDeploymentWeight);
    return createTrafficSplitManifestFile(kubectl, serviceName, stableDeploymentWeight, baselineAndCanaryWeight, baselineAndCanaryWeight);
}

function createTrafficSplitManifestFile(kubectl: Kubectl, serviceName: string, stableWeight: number, baselineWeight: number, canaryWeight: number): string {
    const smiObjectString = getTrafficSplitObject(kubectl, serviceName, stableWeight, baselineWeight, canaryWeight);
    const manifestFile = fileHelper.writeManifestToFile(smiObjectString, TRAFFIC_SPLIT_OBJECT, serviceName);
    if (!manifestFile) {
        throw new Error('UnableToCreateTrafficSplitManifestFile');
    }

    return manifestFile;
}

function getTrafficSplitObject(kubectl: Kubectl, name: string, stableWeight: number, baselineWeight: number, canaryWeight: number): string {
    if(!trafficSplitAPIVersion)
    {
        trafficSplitAPIVersion = kubectlUtils.getTrafficSplitAPIVersion(kubectl);
    }
    const trafficSplitObjectJson = `{
        "apiVersion": "${trafficSplitAPIVersion}",
        "kind": "TrafficSplit",
        "metadata": {
            "name": "%s"
        },
        "spec": {
            "backends": [
                {
                    "service": "%s",
                    "weight": "%sm"
                },
                {
                    "service": "%s",
                    "weight": "%sm"
                },
                {
                    "service": "%s",
                    "weight": "%sm"
                }
            ],
            "service": "%s"
        }
    }`;

    const trafficSplitObject = util.format(trafficSplitObjectJson, getTrafficSplitResourceName(name), canaryDeploymentHelper.getStableResourceName(name), stableWeight, canaryDeploymentHelper.getBaselineResourceName(name), baselineWeight, canaryDeploymentHelper.getCanaryResourceName(name), canaryWeight, name);
    return trafficSplitObject;
}

function getTrafficSplitResourceName(name: string) {
    return name + TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX;
}