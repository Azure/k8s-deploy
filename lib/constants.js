'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowAnnotations = exports.workloadTypesWithRolloutStatus = exports.workloadTypes = exports.deploymentTypes = exports.ServiceTypes = exports.DiscoveryAndLoadBalancerResource = exports.KubernetesWorkload = void 0;
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
exports.workflowAnnotations = [
    `run=${process.env['GITHUB_RUN_ID']}`,
    `workflow="${process.env['GITHUB_WORKFLOW']}"`,
    `jobName="${process.env['GITHUB_JOB']}"`,
    `createdBy=${process.env['GITHUB_ACTOR']}`,
    `runUri=https://github.com/${process.env['GITHUB_REPOSITORY']}/actions/runs/${process.env['GITHUB_RUN_ID']}`,
    `commit=${process.env['GITHUB_SHA']}`,
    `branch=${process.env['GITHUB_REF']}`
];
