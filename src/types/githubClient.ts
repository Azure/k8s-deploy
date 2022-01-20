import * as core from "@actions/core";
import { Octokit } from "@octokit/core";
import { Endpoints } from "@octokit/types";
import { retry } from "@octokit/plugin-retry";

export const OkStatusCode = 200;

const RetryOctokit = Octokit.plugin(retry);
const RETRY_COUNT = 5;
const requestUrl = "GET /repos/{owner}/{repo}/actions/workflows";
type responseType =
  Endpoints["GET /repos/{owner}/{repo}/actions/workflows"]["response"];

export class GitHubClient {
  private readonly repository: string;
  private readonly token: string;

  constructor(repository: string, token: string) {
    this.repository = repository;
    this.token = token;
  }

  public async getWorkflows(): Promise<responseType> {
    const octokit = new RetryOctokit({
      auth: this.token,
      request: { retries: RETRY_COUNT },
    });
    const [owner, repo] = this.repository.split("/");

    core.debug(`Getting workflows for repo: ${this.repository}`);
    return Promise.resolve(
      await octokit.request(requestUrl, {
        owner,
        repo,
      })
    );
  }
}
