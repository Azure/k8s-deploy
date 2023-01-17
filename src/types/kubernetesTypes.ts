export class KubernetesWorkload {
   public static POD: string = 'Pod'
   public static REPLICASET: string = 'Replicaset'
   public static DEPLOYMENT: string = 'Deployment'
   public static STATEFUL_SET: string = 'StatefulSet'
   public static DAEMON_SET: string = 'DaemonSet'
   public static JOB: string = 'job'
   public static CRON_JOB: string = 'cronjob'
}

export class DiscoveryAndLoadBalancerResource {
   public static SERVICE: string = 'service'
   public static INGRESS: string = 'ingress'
}

export class ServiceTypes {
   public static LOAD_BALANCER: string = 'LoadBalancer'
   public static NODE_PORT: string = 'NodePort'
   public static CLUSTER_IP: string = 'ClusterIP'
}

export const DEPLOYMENT_TYPES: string[] = [
   'deployment',
   'replicaset',
   'daemonset',
   'pod',
   'statefulset'
]

export const WORKLOAD_TYPES: string[] = [
   'deployment',
   'replicaset',
   'daemonset',
   'pod',
   'scaledjob',
   'statefulset',
   'job',
   'cronjob'
]

export const WORKLOAD_TYPES_WITH_ROLLOUT_STATUS: string[] = [
   'deployment',
   'daemonset',
   'statefulset'
]

export function isDeploymentEntity(kind: string): boolean {
   if (!kind) throw ResourceKindNotDefinedError

   return DEPLOYMENT_TYPES.some((type: string) => {
      return type.toLowerCase() === kind.toLowerCase()
   })
}

export function isWorkloadEntity(kind: string): boolean {
   if (!kind) throw ResourceKindNotDefinedError

   return WORKLOAD_TYPES.some(
      (type: string) => type.toLowerCase() === kind.toLowerCase()
   )
}

export function isServiceEntity(kind: string): boolean {
   if (!kind) throw ResourceKindNotDefinedError

   return 'service' === kind.toLowerCase()
}

export function isIngressEntity(kind: string): boolean {
   if (!kind) throw ResourceKindNotDefinedError

   return 'ingress' === kind.toLowerCase()
}

export const ResourceKindNotDefinedError = Error('Resource kind not defined')
export const NullInputObjectError = Error('Null inputObject')
export const InputObjectKindNotDefinedError = Error(
   'Input object kind not defined'
)
export const InputObjectMetadataNotDefinedError = Error(
   'Input object metatada not defined'
)
