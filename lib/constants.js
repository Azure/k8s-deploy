'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkflowAnnotationKeyLabel = exports.getWorkflowAnnotationsJson = exports.workloadTypesWithRolloutStatus = exports.workloadTypes = exports.deploymentTypes = exports.ServiceTypes = exports.DiscoveryAndLoadBalancerResource = exports.KubernetesWorkload = void 0;
class KubernetesWorkload {
}
exports.KubernetesWorkload = KubernetesWorkload;
KubernetesWorkload.pod = 'Pod';
KubernetesWorkload.replicaset = 'Replicaset';
KubernetesWorkload.deployment = 'Deployment';
KubernetesWorkload.statefulSet = 'StatefulSet';
KubernetesWorkload.daemonSet = 'DaemonSet';
KubernetesWorkload.job = 'job';
KubernetesWorkload.cronjob = 'cronjob';
class DiscoveryAndLoadBalancerResource {
}
exports.DiscoveryAndLoadBalancerResource = DiscoveryAndLoadBalancerResource;
DiscoveryAndLoadBalancerResource.service = 'service';
DiscoveryAndLoadBalancerResource.ingress = 'ingress';
class ServiceTypes {
}
exports.ServiceTypes = ServiceTypes;
ServiceTypes.loadBalancer = 'LoadBalancer';
ServiceTypes.nodePort = 'NodePort';
ServiceTypes.clusterIP = 'ClusterIP';
exports.deploymentTypes = ['deployment', 'replicaset', 'daemonset', 'pod', 'statefulset'];
exports.workloadTypes = ['deployment', 'replicaset', 'daemonset', 'pod', 'statefulset', 'job', 'cronjob'];
exports.workloadTypesWithRolloutStatus = ['deployment', 'daemonset', 'statefulset'];
function getWorkflowAnnotationsJson(lastSuccessRunSha, workflowFilePath, filePathConfigs) {
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
    annotationObject["dockerfilePaths"] = filePathConfigs.dockerfilePaths;
    annotationObject["manifestsPaths"] = filePathConfigs.manifestFilePaths;
    annotationObject["helmChartPaths"] = filePathConfigs.helmChartFilePaths;
    annotationObject["provider"] = "GitHub";
    return JSON.stringify(annotationObject);
}
exports.getWorkflowAnnotationsJson = getWorkflowAnnotationsJson;
function getWorkflowAnnotationKeyLabel(workflowFilePath) {
    const hashKey = require("crypto").createHash("MD5")
        .update(`${process.env.GITHUB_REPOSITORY}/${workflowFilePath}`)
        .digest("hex");
    return `githubWorkflow_${hashKey}`;
}
exports.getWorkflowAnnotationKeyLabel = getWorkflowAnnotationKeyLabel;
