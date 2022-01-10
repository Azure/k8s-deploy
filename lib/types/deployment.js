"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDeployment = void 0;
const deploymentTypes = [
    "deployment",
    "replicaset",
    "daemonset",
    "pod",
    "statefulset",
];
exports.isDeployment = (kind) => deploymentTypes.some((x) => x == kind.toLowerCase());
