'use strict';

import * as core from '@actions/core';

export let namespace: string = core.getInput('namespace');
export const containers: string[] = core.getInput('images').split('\n');
export const imagePullSecrets: string[] = core.getInput('imagepullsecrets').split('\n');
export const manifests = core.getInput('manifests').split('\n');
export const canaryPercentage: string = core.getInput('percentage');
export const deploymentStrategy: string = core.getInput('strategy');
export const trafficSplitMethod: string = core.getInput('traffic-split-method');
export const baselineAndCanaryReplicas: string = core.getInput('baseline-and-canary-replicas');
export const args: string = core.getInput('arguments');

if (!namespace) {
    core.debug('Namespace was not supplied; using "default" namespace instead.');
    namespace = 'default';
}