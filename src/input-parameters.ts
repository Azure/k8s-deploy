'use strict';

import * as core from '@actions/core';

export let namespace: string = core.getInput('namespace');
export const containers: string[] = core.getInput('images').split('\n');
export const imagePullSecrets: string[] = core.getInput('imagepullsecrets').split('\n').filter(secret => secret.trim().length > 0);
export const manifests = core.getInput('manifests').split('\n');
export const canaryPercentage: string = core.getInput('percentage');
export const deploymentStrategy: string = core.getInput('strategy');
export const trafficSplitMethod: string = core.getInput('traffic-split-method');
export const routeMethod: string = core.getInput('route-method');
export const versionSwitchBuffer: string = core.getInput('version-switch-buffer');
export const baselineAndCanaryReplicas: string = core.getInput('baseline-and-canary-replicas');
export const args: string = core.getInput('arguments');
export const forceDeployment: boolean = core.getInput('force').toLowerCase() == 'true';

if (!namespace) {
    core.debug('Namespace was not supplied; using "default" namespace instead.');
    namespace = 'default';
}

try {
    const pe = parseInt(canaryPercentage);
    if (pe < 0 || pe > 100) {
        core.setFailed('A valid percentage value is between 0 and 100');
        process.exit(1);
    }
} catch (ex) {
    core.setFailed("Enter a valid 'percentage' integer value ");
    process.exit(1);
}

try {
    const pe = parseInt(baselineAndCanaryReplicas);
    if (pe < 0 || pe > 100) {
        core.setFailed('A valid baseline-and-canary-replicas value is between 0 and 100');
        process.exit(1);
    }
} catch (ex) {
    core.setFailed("Enter a valid 'baseline-and-canary-replicas' integer value");
    process.exit(1);
}

try {
    const pe = parseInt(versionSwitchBuffer);
    if (pe < 0 || pe > 300) {
        core.setFailed('Invalid buffer time, valid version-switch-buffer is a value more than or equal to 0 and lesser than or equal 300');
        process.exit(1);
    }
} catch (ex) {
    core.setFailed("Enter a valid 'version-switch-buffer' integer value");
    process.exit(1);
}