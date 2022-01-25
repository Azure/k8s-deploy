"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputObjectMetadataNotDefinedError = exports.InputObjectKindNotDefinedError = exports.NullInputObjectError = exports.ResourceKindNotDefinedError = exports.isIngressEntity = exports.isServiceEntity = exports.isWorkloadEntity = exports.isDeploymentEntity = exports.WORKLOAD_TYPES_WITH_ROLLOUT_STATUS = exports.WORKLOAD_TYPES = exports.DEPLOYMENT_TYPES = exports.ServiceTypes = exports.DiscoveryAndLoadBalancerResource = exports.KubernetesWorkload = void 0;
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
function isDeploymentEntity(kind) {
    if (!kind)
        throw exports.ResourceKindNotDefinedError;
    return exports.DEPLOYMENT_TYPES.some((type) => {
        return type.toLowerCase() === kind.toLowerCase();
    });
}
exports.isDeploymentEntity = isDeploymentEntity;
function isWorkloadEntity(kind) {
    if (!kind)
        throw exports.ResourceKindNotDefinedError;
    return exports.WORKLOAD_TYPES.some((type) => type.toLowerCase() === kind.toLowerCase());
}
exports.isWorkloadEntity = isWorkloadEntity;
function isServiceEntity(kind) {
    if (!kind)
        throw exports.ResourceKindNotDefinedError;
    return "service" === kind.toLowerCase();
}
exports.isServiceEntity = isServiceEntity;
function isIngressEntity(kind) {
    if (!kind)
        throw exports.ResourceKindNotDefinedError;
    return "ingress" === kind.toLowerCase();
}
exports.isIngressEntity = isIngressEntity;
exports.ResourceKindNotDefinedError = Error("Resource kind not defined");
exports.NullInputObjectError = Error("Null inputObject");
exports.InputObjectKindNotDefinedError = Error("Input object kind not defined");
exports.InputObjectMetadataNotDefinedError = Error("Input object metatada not defined");
