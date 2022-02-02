"use strict";
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
const KubernetesConstants = require("../types/kubernetesTypes");
const kubectlUtils_1 = require("./kubectlUtils");
const timeUtils_1 = require("./timeUtils");
function checkManifestStability(kubectl, resources) {
    return __awaiter(this, void 0, void 0, function* () {
        let rolloutStatusHasErrors = false;
        for (let i = 0; i < resources.length; i++) {
            const resource = resources[i];
            if (KubernetesConstants.WORKLOAD_TYPES_WITH_ROLLOUT_STATUS.indexOf(resource.type.toLowerCase()) >= 0) {
                try {
                    const result = yield kubectl.checkRolloutStatus(resource.type, resource.name);
                    kubectlUtils_1.checkForErrors([result]);
                }
                catch (ex) {
                    core.error(ex);
                    yield kubectl.describe(resource.type, resource.name);
                    rolloutStatusHasErrors = true;
                }
            }
            if (resource.type == KubernetesConstants.KubernetesWorkload.POD) {
                try {
                    yield checkPodStatus(kubectl, resource.name);
                }
                catch (ex) {
                    core.warning(`Could not determine pod status: ${JSON.stringify(ex)}`);
                    yield kubectl.describe(resource.type, resource.name);
                }
            }
            if (resource.type ==
                KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE) {
                try {
                    const service = yield getService(kubectl, resource.name);
                    const { spec, status } = service;
                    if (spec.type === KubernetesConstants.ServiceTypes.LOAD_BALANCER) {
                        if (!isLoadBalancerIPAssigned(status)) {
                            yield waitForServiceExternalIPAssignment(kubectl, resource.name);
                        }
                        else {
                            core.info(`ServiceExternalIP ${resource.name} ${status.loadBalancer.ingress[0].ip}`);
                        }
                    }
                }
                catch (ex) {
                    core.warning(`Could not determine service status of: ${resource.name} Error: ${ex}`);
                    yield kubectl.describe(resource.type, resource.name);
                }
            }
        }
        if (rolloutStatusHasErrors) {
            throw new Error("Rollout status error");
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
            yield timeUtils_1.sleep(sleepTimeout);
            core.debug(`Polling for pod status: ${podName}`);
            podStatus = yield getPodStatus(kubectl, podName);
            if (podStatus &&
                (podStatus === null || podStatus === void 0 ? void 0 : podStatus.phase) !== "Pending" &&
                (podStatus === null || podStatus === void 0 ? void 0 : podStatus.phase) !== "Unknown") {
                break;
            }
        }
        podStatus = yield getPodStatus(kubectl, podName);
        switch (podStatus.phase) {
            case "Succeeded":
            case "Running":
                if (isPodReady(podStatus)) {
                    console.log(`pod/${podName} is successfully rolled out`);
                }
                else {
                    kubectlDescribeNeeded = true;
                }
                break;
            case "Pending":
                if (!isPodReady(podStatus)) {
                    core.warning(`pod/${podName} rollout status check timed out`);
                    kubectlDescribeNeeded = true;
                }
                break;
            case "Failed":
                core.error(`pod/${podName} rollout failed`);
                kubectlDescribeNeeded = true;
                break;
            default:
                core.warning(`pod/${podName} rollout status: ${podStatus.phase}`);
        }
        if (kubectlDescribeNeeded) {
            yield kubectl.describe("pod", podName);
        }
    });
}
exports.checkPodStatus = checkPodStatus;
function getPodStatus(kubectl, podName) {
    return __awaiter(this, void 0, void 0, function* () {
        const podResult = yield kubectl.getResource("pod", podName);
        kubectlUtils_1.checkForErrors([podResult]);
        return JSON.parse(podResult.stdout).status;
    });
}
function isPodReady(podStatus) {
    let allContainersAreReady = true;
    podStatus.containerStatuses.forEach((container) => {
        if (container.ready === false) {
            core.info(`'${container.name}' status: ${JSON.stringify(container.state)}`);
            allContainersAreReady = false;
        }
    });
    if (!allContainersAreReady) {
        core.warning("All containers not in ready state");
    }
    return allContainersAreReady;
}
function getService(kubectl, serviceName) {
    return __awaiter(this, void 0, void 0, function* () {
        const serviceResult = yield kubectl.getResource(KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE, serviceName);
        kubectlUtils_1.checkForErrors([serviceResult]);
        return JSON.parse(serviceResult.stdout);
    });
}
function waitForServiceExternalIPAssignment(kubectl, serviceName) {
    return __awaiter(this, void 0, void 0, function* () {
        const sleepTimeout = 10 * 1000; // 10 seconds
        const iterations = 18; // 18 * 10 seconds timeout = 3 minutes max timeout
        for (let i = 0; i < iterations; i++) {
            core.info(`Wait for service ip assignment : ${serviceName}`);
            yield timeUtils_1.sleep(sleepTimeout);
            const status = (yield getService(kubectl, serviceName)).status;
            if (isLoadBalancerIPAssigned(status)) {
                core.info(`ServiceExternalIP ${serviceName} ${status.loadBalancer.ingress[0].ip}`);
                return;
            }
        }
        core.warning(`Wait for service ip assignment timed out${serviceName}`);
    });
}
function isLoadBalancerIPAssigned(status) {
    var _a, _b;
    return ((_b = (_a = status === null || status === void 0 ? void 0 : status.loadBalancer) === null || _a === void 0 ? void 0 : _a.ingress) === null || _b === void 0 ? void 0 : _b.length) > 0;
}
