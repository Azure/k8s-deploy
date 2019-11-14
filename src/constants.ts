'use strict';

export class KubernetesWorkload {
    public static pod: string = 'Pod';
    public static replicaset: string = 'Replicaset';
    public static deployment: string = 'Deployment';
    public static statefulSet: string = 'StatefulSet';
    public static daemonSet: string = 'DaemonSet';
    public static job: string = 'job';
    public static cronjob: string = 'cronjob';
}

export class DiscoveryAndLoadBalancerResource {
    public static service: string = 'service';
    public static ingress: string = 'ingress';
}

export class ServiceTypes {
    public static loadBalancer: string = 'LoadBalancer';
    public static nodePort: string = 'NodePort';
    public static clusterIP: string = 'ClusterIP'
}

export const deploymentTypes: string[] = ['deployment', 'replicaset', 'daemonset', 'pod', 'statefulset'];
export const workloadTypes: string[] = ['deployment', 'replicaset', 'daemonset', 'pod', 'statefulset', 'job', 'cronjob'];
export const workloadTypesWithRolloutStatus: string[] = ['deployment', 'daemonset', 'statefulset'];
