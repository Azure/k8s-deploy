export class DeploymentReport {
    artifacts: Artifact[]
    pipeline: Pipeline;
    targetResource: TargetResource;
}

export class Artifact {
    type: string;
    properties: any;
}

export class Pipeline {
    provider: string;
    properties: GitHubPipelineProperties | any;
}

export class GitHubPipelineProperties {
    repository: string;
    workflow: string;
    run: string;
    runUri: string;
    createdBy: string;
    branch: string;
    jobName: string;
    creationTimestamp: string;
    modifiedTimestamp: string;
    status: string;
    commit: string;
}

export class TargetResource {
    id: string;
    provider: string;
    type: string;
    properties: any;
}

export function getGitHubPipelineProperties(status: string, workflowFilePath?: string): GitHubPipelineProperties {
    let properties: GitHubPipelineProperties = {
        run: `${process.env.GITHUB_RUN_ID}`,
        repository: `${process.env.GITHUB_REPOSITORY}`,
        workflow: `${workflowFilePath || process.env.GITHUB_WORKFLOW}`,
        jobName: `${process.env.GITHUB_JOB}`,
        createdBy: `${process.env.GITHUB_ACTOR}`,
        runUri: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        commit: `${process.env.GITHUB_SHA}`,
        branch: `${process.env.GITHUB_REF}`,
        creationTimestamp: '',
        modifiedTimestamp: `${(new Date()).toString()}`,
        status: status,
    }
    
    return properties;
}