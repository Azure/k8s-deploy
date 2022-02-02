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
exports.reject = void 0;
const core = require("@actions/core");
const canaryDeploymentHelper = require("../strategyHelpers/canary/canaryHelper");
const SMICanaryDeploymentHelper = require("../strategyHelpers/canary/smiCanaryHelper");
const serviceBlueGreenHelper_1 = require("../strategyHelpers/blueGreen/serviceBlueGreenHelper");
const ingressBlueGreenHelper_1 = require("../strategyHelpers/blueGreen/ingressBlueGreenHelper");
const smiBlueGreenHelper_1 = require("../strategyHelpers/blueGreen/smiBlueGreenHelper");
const deploymentStrategy_1 = require("../types/deploymentStrategy");
const trafficSplitMethod_1 = require("../types/trafficSplitMethod");
const routeStrategy_1 = require("../types/routeStrategy");
function reject(kubectl, manifests, deploymentStrategy) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (deploymentStrategy) {
            case deploymentStrategy_1.DeploymentStrategy.CANARY:
                yield rejectCanary(kubectl, manifests);
                break;
            case deploymentStrategy_1.DeploymentStrategy.BLUE_GREEN:
                yield rejectBlueGreen(kubectl, manifests);
                break;
            default:
                throw "Invalid delete deployment strategy";
        }
    });
}
exports.reject = reject;
function rejectCanary(kubectl, manifests) {
    return __awaiter(this, void 0, void 0, function* () {
        let includeServices = false;
        const trafficSplitMethod = trafficSplitMethod_1.parseTrafficSplitMethod(core.getInput("traffic-split-method", { required: true }));
        if (trafficSplitMethod == trafficSplitMethod_1.TrafficSplitMethod.SMI) {
            core.info("Rejecting deployment with SMI canary strategy");
            includeServices = true;
            yield SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(kubectl, manifests);
        }
        core.info("Deleting baseline and canary workloads");
        yield canaryDeploymentHelper.deleteCanaryDeployment(kubectl, manifests, includeServices);
    });
}
function rejectBlueGreen(kubectl, manifests) {
    return __awaiter(this, void 0, void 0, function* () {
        core.info("Rejecting deployment with blue green strategy");
        const routeStrategy = routeStrategy_1.parseRouteStrategy(core.getInput("route-method", { required: true }));
        if (routeStrategy == routeStrategy_1.RouteStrategy.INGRESS) {
            yield ingressBlueGreenHelper_1.rejectBlueGreenIngress(kubectl, manifests);
        }
        else if (routeStrategy == routeStrategy_1.RouteStrategy.SMI) {
            yield smiBlueGreenHelper_1.rejectBlueGreenSMI(kubectl, manifests);
        }
        else {
            yield serviceBlueGreenHelper_1.rejectBlueGreenService(kubectl, manifests);
        }
    });
}
