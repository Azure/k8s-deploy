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
    return `{`
        + `'run': '${process.env.GITHUB_RUN_ID}',`
        + `'repository': '${process.env.GITHUB_REPOSITORY}',`
        + `'workflow': '${process.env.GITHUB_WORKFLOW}',`
        + `'workflowFileName': '${workflowFilePath.replace(".github/workflows/", "")}',`
        + `'jobName': '${process.env.GITHUB_JOB}',`
        + `'createdBy': '${process.env.GITHUB_ACTOR}',`
        + `'runUri': 'https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}',`
        + `'commit': '${process.env.GITHUB_SHA}',`
        + `'lastSuccessRunCommit': '${lastSuccessRunSha}',`
        + `'branch': '${process.env.GITHUB_REF}',`
        + `'deployTimestamp': '${Date.now()}',`
        + `'dockerfilePaths': '${JSON.stringify(filePathConfigs.dockerfilePaths)}',`
        + `'manifestsPaths': '${JSON.stringify(filePathConfigs.manifestFilePaths)}',`
        + `'helmChartPaths': '${JSON.stringify(filePathConfigs.helmChartFilePaths)}',`
        + `'provider': 'GitHub'`
        + `}`;
}
exports.getWorkflowAnnotationsJson = getWorkflowAnnotationsJson;
function getWorkflowAnnotationKeyLabel(workflowFilePath) {
    const hashKey = require("crypto").createHash("MD5")
        .update(`${process.env.GITHUB_REPOSITORY}/${workflowFilePath}`)
        .digest("hex");
    return `githubWorkflow_${hashKey}`;
}
exports.getWorkflowAnnotationKeyLabel = getWorkflowAnnotationKeyLabel;
