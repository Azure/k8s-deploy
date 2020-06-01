'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.workloadTypesWithRolloutStatus = exports.workloadTypes = exports.deploymentTypes = exports.ServiceTypes = exports.DiscoveryAndLoadBalancerResource = exports.KubernetesWorkload = void 0;
let KubernetesWorkload = /** @class */ (() => {
    class KubernetesWorkload {
    }
    KubernetesWorkload.pod = 'Pod';
    KubernetesWorkload.replicaset = 'Replicaset';
    KubernetesWorkload.deployment = 'Deployment';
    KubernetesWorkload.statefulSet = 'StatefulSet';
    KubernetesWorkload.daemonSet = 'DaemonSet';
    KubernetesWorkload.job = 'job';
    KubernetesWorkload.cronjob = 'cronjob';
    return KubernetesWorkload;
})();
exports.KubernetesWorkload = KubernetesWorkload;
let DiscoveryAndLoadBalancerResource = /** @class */ (() => {
    class DiscoveryAndLoadBalancerResource {
    }
    DiscoveryAndLoadBalancerResource.service = 'service';
    DiscoveryAndLoadBalancerResource.ingress = 'ingress';
    return DiscoveryAndLoadBalancerResource;
})();
exports.DiscoveryAndLoadBalancerResource = DiscoveryAndLoadBalancerResource;
let ServiceTypes = /** @class */ (() => {
    class ServiceTypes {
    }
    ServiceTypes.loadBalancer = 'LoadBalancer';
    ServiceTypes.nodePort = 'NodePort';
    ServiceTypes.clusterIP = 'ClusterIP';
    return ServiceTypes;
})();
exports.ServiceTypes = ServiceTypes;
exports.deploymentTypes = ['deployment', 'replicaset', 'daemonset', 'pod', 'statefulset'];
exports.workloadTypes = ['deployment', 'replicaset', 'daemonset', 'pod', 'statefulset', 'job', 'cronjob'];
exports.workloadTypesWithRolloutStatus = ['deployment', 'daemonset', 'statefulset'];
