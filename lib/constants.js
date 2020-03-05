'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
class KubernetesWorkload {
}
KubernetesWorkload.pod = 'Pod';
KubernetesWorkload.replicaset = 'Replicaset';
KubernetesWorkload.deployment = 'Deployment';
KubernetesWorkload.statefulSet = 'StatefulSet';
KubernetesWorkload.daemonSet = 'DaemonSet';
KubernetesWorkload.job = 'job';
KubernetesWorkload.cronjob = 'cronjob';
exports.KubernetesWorkload = KubernetesWorkload;
class DiscoveryAndLoadBalancerResource {
}
DiscoveryAndLoadBalancerResource.service = 'service';
DiscoveryAndLoadBalancerResource.ingress = 'ingress';
exports.DiscoveryAndLoadBalancerResource = DiscoveryAndLoadBalancerResource;
class ServiceTypes {
}
ServiceTypes.loadBalancer = 'LoadBalancer';
ServiceTypes.nodePort = 'NodePort';
ServiceTypes.clusterIP = 'ClusterIP';
exports.ServiceTypes = ServiceTypes;
exports.deploymentTypes = ['deployment', 'replicaset', 'daemonset', 'pod', 'statefulset'];
exports.workloadTypes = ['deployment', 'replicaset', 'daemonset', 'pod', 'statefulset', 'job', 'cronjob'];
exports.workloadTypesWithRolloutStatus = ['deployment', 'daemonset', 'statefulset'];
