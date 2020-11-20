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

export function getWorkflowAnnotationsJson(lastSuccessRunSha: string, workflowFilePath: string, filePathConfigs: any): string {
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
        + `'filePathConfigs': '${filePathConfigs}',`
        + `'provider': 'GitHub'`
        + `}`;
}

export function getWorkflowAnnotationKeyLabel(workflowFilePath: string): string {
    const hashKey = require("crypto").createHash("MD5")
        .update(`${process.env.GITHUB_REPOSITORY}/${workflowFilePath}`)
        .digest("hex");
    return `githubWorkflow_${hashKey}`;
}