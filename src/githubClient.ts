import * as core from "@actions/core";
import { Octokit } from "@octokit/core";
import { OctokitResponse, Endpoints } from "@octokit/types";
import { retry } from "@octokit/plugin-retry";

const RetryOctokit = Octokit.plugin(retry);
const RETRY_COUNT = 5;
type responseType =
  Endpoints["GET /repos/{owner}/{repo}/actions/workflows"]["response"];

export class GitHubClient {
  private repository: string;
  private token: string;

  constructor(repository: string, token: string) {
    this.repository = repository;
    this.token = token;
  }

  public async getWorkflows(): Promise<OctokitResponse<responseType>> {
    const octokit = new RetryOctokit({
      auth: this.token,
      request: { retries: RETRY_COUNT },
    });
    core.debug(`Getting workflows for repo: ${this.repository}`);
    return Promise.resolve(
      await octokit.request(`GET /repos/${this.repository}/actions/workflows`)
    );
  }
}
