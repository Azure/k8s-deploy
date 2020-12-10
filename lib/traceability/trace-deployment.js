"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGitHubPipelineProperties = exports.TargetResource = exports.GitHubPipelineProperties = exports.Pipeline = exports.Artifact = exports.DeploymentReport = void 0;
class DeploymentReport {
}
exports.DeploymentReport = DeploymentReport;
class Artifact {
}
exports.Artifact = Artifact;
class Pipeline {
}
exports.Pipeline = Pipeline;
class GitHubPipelineProperties {
}
exports.GitHubPipelineProperties = GitHubPipelineProperties;
class TargetResource {
}
exports.TargetResource = TargetResource;
function getGitHubPipelineProperties(status, workflowFilePath) {
    let properties = {
        run: `${process.env.GITHUB_RUN_ID}`,
        repository: `${process.env.GITHUB_REPOSITORY}`,
        workflow: `${workflowFilePath || process.env.GITHUB_WORKFLOW}`,
        jobName: `${process.env.GITHUB_JOB}`,
        createdBy: `${process.env.GITHUB_ACTOR}`,
        runUri: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        commit: `${process.env.GITHUB_SHA}`,
        branch: `${process.env.GITHUB_REF}`,
        creationTimestamp: '',
        modifiedTimestamp: `${Date.now()}`,
        status: status,
    };
    return properties;
}
exports.getGitHubPipelineProperties = getGitHubPipelineProperties;
