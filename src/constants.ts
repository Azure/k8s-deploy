import { DeploymentConfig } from "./utilities/utility";

export class KubernetesWorkload {
  public static POD: string = "Pod";
  public static REPLICASET: string = "Replicaset";
  public static DEPLOYMENT: string = "Deployment";
  public static STATEFUL_SET: string = "StatefulSet";
  public static DAEMON_SET: string = "DaemonSet";
  public static JOB: string = "job";
  public static CRON_JOB: string = "cronjob";
}

export class DiscoveryAndLoadBalancerResource {
  public static SERVICE: string = "service";
  public static INGRESS: string = "ingress";
}

export class ServiceTypes {
  public static LOAD_BALANCER: string = "LoadBalancer";
  public static NODE_PORT: string = "NodePort";
  public static CLUSTER_IP: string = "ClusterIP";
}

export const DEPLOYMENT_TYPES: string[] = [
  "deployment",
  "replicaset",
  "daemonset",
  "pod",
  "statefulset",
];
export const WORKLOAD_TYPES: string[] = [
  "deployment",
  "replicaset",
  "daemonset",
  "pod",
  "statefulset",
  "job",
  "cronjob",
];
export const WORKLOAD_TYPES_WITH_ROLLOUT_STATUS: string[] = [
  "deployment",
  "daemonset",
  "statefulset",
];

export function getWorkflowAnnotationsJson(
  lastSuccessRunSha: string,
  workflowFilePath: string,
  deploymentConfig: DeploymentConfig
): string {
  let annotationObject: any = {};
  annotationObject["run"] = process.env.GITHUB_RUN_ID;
  annotationObject["repository"] = process.env.GITHUB_REPOSITORY;
  annotationObject["workflow"] = process.env.GITHUB_WORKFLOW;
  annotationObject["workflowFileName"] = workflowFilePath.replace(
    ".github/workflows/",
    ""
  );
  annotationObject["jobName"] = process.env.GITHUB_JOB;
  annotationObject["createdBy"] = process.env.GITHUB_ACTOR;
  annotationObject[
    "runUri"
  ] = `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
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

export function getWorkflowAnnotationKeyLabel(
  workflowFilePath: string
): string {
  const hashKey = require("crypto")
    .createHash("MD5")
    .update(`${process.env.GITHUB_REPOSITORY}/${workflowFilePath}`)
    .digest("hex");
  return `githubWorkflow_${hashKey}`;
}
