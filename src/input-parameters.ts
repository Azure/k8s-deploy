'use strict';

import * as tl from '@actions/core';

export let namespace: string = tl.getInput('namespace');
export const containers: string[] = tl.getInput('images').split('\n');
export const imagePullSecrets: string[] = tl.getInput('imagepullsecrets').split('\n');
export const manifests = tl.getInput('manifests').split('\n');
export const canaryPercentage: string = tl.getInput('percentage');
export const deploymentStrategy: string = tl.getInput('strategy');
export const trafficSplitMethod: string = tl.getInput('trafficSplitMethod');
export const baselineAndCanaryReplicas: string = tl.getInput('baselineAndCanaryReplicas');
export const args: string = tl.getInput('arguments');

if (!namespace) {
    tl.debug('Namespace was not supplied; using "default" namespace instead.');
    namespace = 'default';
}