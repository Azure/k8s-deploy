'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.workloadTypesWithRolloutStatus = exports.workloadTypes = exports.deploymentTypes = exports.ServiceTypes = exports.DiscoveryAndLoadBalancerResource = exports.KubernetesWorkload = void 0;
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
