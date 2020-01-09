'use strict';

import * as core from '@actions/core';
import * as utils from './utility';
import * as KubernetesConstants from '../constants';
import { Kubectl, Resource } from '../kubectl-object-model';

export async function checkManifestStability(kubectl: Kubectl, resources: Resource[]): Promise<void> {
    let rolloutStatusHasErrors = false;
    const numberOfResources = resources.length;
    for (let i = 0; i < numberOfResources; i++) {
        const resource = resources[i];
        if (KubernetesConstants.workloadTypesWithRolloutStatus.indexOf(resource.type.toLowerCase()) >= 0) {
            try {
                var result = kubectl.checkRolloutStatus(resource.type, resource.name);
                utils.checkForErrors([result]);
            } catch (ex) {
                core.error(ex);
                kubectl.describe(resource.type, resource.name);
                rolloutStatusHasErrors = true;
            }
        }
        if (utils.isEqual(resource.type, KubernetesConstants.KubernetesWorkload.pod, true)) {
            try {
                await checkPodStatus(kubectl, resource.name);
            } catch (ex) {
                core.warning(`CouldNotDeterminePodStatus ${JSON.stringify(ex)}`);
                kubectl.describe(resource.type, resource.name);
            }
        }
        if (utils.isEqual(resource.type, KubernetesConstants.DiscoveryAndLoadBalancerResource.service, true)) {
            try {
                const service = getService(kubectl, resource.name);
                const spec = service.spec;
                const status = service.status;
                if (utils.isEqual(spec.type, KubernetesConstants.ServiceTypes.loadBalancer, true)) {
                    if (!isLoadBalancerIPAssigned(status)) {
                        await waitForServiceExternalIPAssignment(kubectl, resource.name);
                    } else {
                        console.log('ServiceExternalIP', resource.name, status.loadBalancer.ingress[0].ip);
                    }
                }
            } catch (ex) {
                core.warning(`CouldNotDetermineServiceStatus of: ${resource.name} Error: ${JSON.stringify(ex)}`);
                kubectl.describe(resource.type, resource.name);
            }
        }
    }

    if (rolloutStatusHasErrors) {
        throw new Error('RolloutStatusTimedout');
    }
}

export async function checkPodStatus(kubectl: Kubectl, podName: string): Promise<void> {
    const sleepTimeout = 10 * 1000; // 10 seconds
    const iterations = 60; // 60 * 10 seconds timeout = 10 minutes max timeout
    let podStatus;
    for (let i = 0; i < iterations; i++) {
        await utils.sleep(sleepTimeout);
        core.debug(`Polling for pod status: ${podName}`);
        podStatus = getPodStatus(kubectl, podName);
        if (podStatus.phase && podStatus.phase !== 'Pending' && podStatus.phase !== 'Unknown') {
            break;
        }
    }
    podStatus = getPodStatus(kubectl, podName);
    switch (podStatus.phase) {
        case 'Succeeded':
        case 'Running':
            if (isPodReady(podStatus)) {
                console.log(`pod/${podName} is successfully rolled out`);
            } else {
                kubectl.describe('pod', podName);
            }
            break;
        case 'Pending':
            if (!isPodReady(podStatus)) {
                core.warning(`pod/${podName} rollout status check timedout`);
                kubectl.describe('pod', podName);
            }
            break;
        case 'Failed':
            core.error(`pod/${podName} rollout failed`);
            kubectl.describe('pod', podName);
            break;
        default:
            core.warning(`pod/${podName} rollout status: ${podStatus.phase}`);
    }
}

function getPodStatus(kubectl: Kubectl, podName: string) {
    const podResult = kubectl.getResource('pod', podName);
    utils.checkForErrors([podResult]);
    const podStatus = JSON.parse(podResult.stdout).status;
    core.debug(`Pod Status: ${JSON.stringify(podStatus)}`);
    return podStatus;
}

function isPodReady(podStatus: any): boolean {
    let allContainersAreReady = true;
    podStatus.containerStatuses.forEach(container => {
        if (container.ready === false) {
            console.log(`'${container.name}' status: ${JSON.stringify(container.state)}`);
            allContainersAreReady = false;
        }
    });
    if (!allContainersAreReady) {
        core.warning('AllContainersNotInReadyState');
    }
    return allContainersAreReady;
}

function getService(kubectl: Kubectl, serviceName) {
    const serviceResult = kubectl.getResource(KubernetesConstants.DiscoveryAndLoadBalancerResource.service, serviceName);
    utils.checkForErrors([serviceResult]);
    return JSON.parse(serviceResult.stdout);
}

async function waitForServiceExternalIPAssignment(kubectl: Kubectl, serviceName: string): Promise<void> {
    const sleepTimeout = 10 * 1000; // 10 seconds
    const iterations = 18; // 18 * 10 seconds timeout = 3 minutes max timeout

    for (let i = 0; i < iterations; i++) {
        console.log(`waitForServiceIpAssignment : ${serviceName}`);
        await utils.sleep(sleepTimeout);
        let status = (getService(kubectl, serviceName)).status;
        if (isLoadBalancerIPAssigned(status)) {
            console.log('ServiceExternalIP', serviceName, status.loadBalancer.ingress[0].ip);
            return;
        }
    }
    core.warning(`waitForServiceIpAssignmentTimedOut ${serviceName}`);
}

function isLoadBalancerIPAssigned(status: any) {
    if (status && status.loadBalancer && status.loadBalancer.ingress && status.loadBalancer.ingress.length > 0) {
        return true;
    }
    return false;
}