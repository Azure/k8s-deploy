"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkflowAnnotationKeyLabel = exports.getWorkflowAnnotationsJson = exports.WORKLOAD_TYPES_WITH_ROLLOUT_STATUS = exports.WORKLOAD_TYPES = exports.DEPLOYMENT_TYPES = exports.ServiceTypes = exports.DiscoveryAndLoadBalancerResource = exports.KubernetesWorkload = void 0;
class KubernetesWorkload {
}
exports.KubernetesWorkload = KubernetesWorkload;
KubernetesWorkload.POD = "Pod";
KubernetesWorkload.REPLICASET = "Replicaset";
KubernetesWorkload.DEPLOYMENT = "Deployment";
KubernetesWorkload.STATEFUL_SET = "StatefulSet";
KubernetesWorkload.DAEMON_SET = "DaemonSet";
KubernetesWorkload.JOB = "job";
KubernetesWorkload.CRON_JOB = "cronjob";
class DiscoveryAndLoadBalancerResource {
}
exports.DiscoveryAndLoadBalancerResource = DiscoveryAndLoadBalancerResource;
DiscoveryAndLoadBalancerResource.SERVICE = "service";
DiscoveryAndLoadBalancerResource.INGRESS = "ingress";
class ServiceTypes {
}
exports.ServiceTypes = ServiceTypes;
ServiceTypes.LOAD_BALANCER = "LoadBalancer";
ServiceTypes.NODE_PORT = "NodePort";
ServiceTypes.CLUSTER_IP = "ClusterIP";
exports.DEPLOYMENT_TYPES = [
    "deployment",
    "replicaset",
    "daemonset",
    "pod",
    "statefulset",
];
exports.WORKLOAD_TYPES = [
    "deployment",
    "replicaset",
    "daemonset",
    "pod",
    "statefulset",
    "job",
    "cronjob",
];
exports.WORKLOAD_TYPES_WITH_ROLLOUT_STATUS = [
    "deployment",
    "daemonset",
    "statefulset",
];
function getWorkflowAnnotationsJson(lastSuccessRunSha, workflowFilePath, deploymentConfig) {
    let annotationObject = {};
    annotationObject["run"] = process.env.GITHUB_RUN_ID;
    annotationObject["repository"] = process.env.GITHUB_REPOSITORY;
    annotationObject["workflow"] = process.env.GITHUB_WORKFLOW;
    annotationObject["workflowFileName"] = workflowFilePath.replace(".github/workflows/", "");
    annotationObject["jobName"] = process.env.GITHUB_JOB;
    annotationObject["createdBy"] = process.env.GITHUB_ACTOR;
    annotationObject["runUri"] = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    annotationObject["commit"] = process.env.GITHUB_SHA;
    annotationObject["lastSuccessRunCommit"] = lastSuccessRunSha;
    annotationObject["branch"] = process.env.GITHUB_REF;
    annotationObject["deployTimestamp"] = Date.now();
    annotationObject["dockerfilePaths"] = deploymentConfig.dockerfilePaths;
    annotationObject["manifestsPaths"] = deploymentConfig.manifestFilePaths;
    annotationObject["helmChartPaths"] = deploymentConfig.helmChartFilePaths;
    annotationObject["provider"] = "GitHub";
    return JSON.stringify(annotationObject);
}
exports.getWorkflowAnnotationsJson = getWorkflowAnnotationsJson;
function getWorkflowAnnotationKeyLabel(workflowFilePath) {
    const hashKey = require("crypto")
        .createHash("MD5")
        .update(`${process.env.GITHUB_REPOSITORY}/${workflowFilePath}`)
        .digest("hex");
    return `githubWorkflow_${hashKey}`;
}
exports.getWorkflowAnnotationKeyLabel = getWorkflowAnnotationKeyLabel;
