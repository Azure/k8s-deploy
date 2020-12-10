'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkPodStatus = exports.checkManifestStability = void 0;
const core = require("@actions/core");
const utils = require("./utility");
const KubernetesConstants = require("../constants");
function checkManifestStability(kubectl, resources) {
    return __awaiter(this, void 0, void 0, function* () {
        let rolloutStatusHasErrors = false;
        const numberOfResources = resources.length;
        for (let i = 0; i < numberOfResources; i++) {
            const resource = resources[i];
            if (KubernetesConstants.workloadTypesWithRolloutStatus.indexOf(resource.type.toLowerCase()) >= 0) {
                try {
                    var result = kubectl.checkRolloutStatus(resource.type, resource.name);
                    utils.checkForErrors([result]);
                }
                catch (ex) {
                    core.error(ex);
                    kubectl.describe(resource.type, resource.name);
                    rolloutStatusHasErrors = true;
                }
            }
            if (utils.isEqual(resource.type, KubernetesConstants.KubernetesWorkload.pod, true)) {
                try {
                    yield checkPodStatus(kubectl, resource.name);
                }
                catch (ex) {
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
                            yield waitForServiceExternalIPAssignment(kubectl, resource.name);
                        }
                        else {
                            console.log('ServiceExternalIP', resource.name, status.loadBalancer.ingress[0].ip);
                        }
                    }
                }
                catch (ex) {
                    core.warning(`CouldNotDetermineServiceStatus of: ${resource.name} Error: ${JSON.stringify(ex)}`);
                    kubectl.describe(resource.type, resource.name);
                }
            }
        }
        if (rolloutStatusHasErrors) {
            throw new Error('RolloutStatusTimedout');
        }
    });
}
exports.checkManifestStability = checkManifestStability;
function checkPodStatus(kubectl, podName) {
    return __awaiter(this, void 0, void 0, function* () {
        const sleepTimeout = 10 * 1000; // 10 seconds
        const iterations = 60; // 60 * 10 seconds timeout = 10 minutes max timeout
        let podStatus;
        let kubectlDescribeNeeded = false;
        for (let i = 0; i < iterations; i++) {
            yield utils.sleep(sleepTimeout);
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
                }
                else {
                    kubectlDescribeNeeded = true;
                }
                break;
            case 'Pending':
                if (!isPodReady(podStatus)) {
                    core.warning(`pod/${podName} rollout status check timedout`);
                    kubectlDescribeNeeded = true;
                }
                break;
            case 'Failed':
                core.error(`pod/${podName} rollout failed`);
                kubectlDescribeNeeded = true;
                break;
            default:
                core.warning(`pod/${podName} rollout status: ${podStatus.phase}`);
        }
        if (kubectlDescribeNeeded) {
            kubectl.describe('pod', podName);
        }
    });
}
exports.checkPodStatus = checkPodStatus;
function getPodStatus(kubectl, podName) {
    const podResult = kubectl.getResource('pod', podName);
    utils.checkForErrors([podResult]);
    const podStatus = JSON.parse(podResult.stdout).status;
    core.debug(`Pod Status: ${JSON.stringify(podStatus)}`);
    return podStatus;
}
function isPodReady(podStatus) {
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
function getService(kubectl, serviceName) {
    const serviceResult = kubectl.getResource(KubernetesConstants.DiscoveryAndLoadBalancerResource.service, serviceName);
    utils.checkForErrors([serviceResult]);
    return JSON.parse(serviceResult.stdout);
}
function waitForServiceExternalIPAssignment(kubectl, serviceName) {
    return __awaiter(this, void 0, void 0, function* () {
        const sleepTimeout = 10 * 1000; // 10 seconds
        const iterations = 18; // 18 * 10 seconds timeout = 3 minutes max timeout
        for (let i = 0; i < iterations; i++) {
            console.log(`waitForServiceIpAssignment : ${serviceName}`);
            yield utils.sleep(sleepTimeout);
            let status = (getService(kubectl, serviceName)).status;
            if (isLoadBalancerIPAssigned(status)) {
                console.log('ServiceExternalIP', serviceName, status.loadBalancer.ingress[0].ip);
                return;
            }
        }
        core.warning(`waitForServiceIpAssignmentTimedOut ${serviceName}`);
    });
}
function isLoadBalancerIPAssigned(status) {
    if (status && status.loadBalancer && status.loadBalancer.ingress && status.loadBalancer.ingress.length > 0) {
        return true;
    }
    return false;
}
