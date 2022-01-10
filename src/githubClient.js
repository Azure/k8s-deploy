import * as core from "@actions/core";
// import { WebRequest, WebResponse, sendRequest } from "./utilities/httpClient";
import { Octokit } from "@octokit/core";
import { retry } from "@octokit/plugin-retry";

const RetryOctokit = Octokit.plugin(retry);
const RETRY_COUNT = 5;

export class GitHubClient {
  repository;
  token;

  constructor(repository, token) {
    this.repository = repository;
    this.token = token;
  }

  async getWorkflows() {
    const octokit = new RetryOctokit({
      auth: this.token,
      request: { retries: RETRY_COUNT },
    });
    core.debug(`Getting workflows for repo: ${this.repository}`);
    return Promise.resolve(
      await octokit.request(`GET /repos/${this.repository}/actions/workflows`)
    );

    /** 
    const getWorkflowFileNameUrl = `https://api.github.com`;
    const webRequest = new WebRequest();
    webRequest.method = "GET";
    webRequest.uri = getWorkflowFileNameUrl;
    webRequest.headers = {
      Authorization: `Bearer ${this.token}`,
    };

    const response: WebResponse = await sendRequest(webRequest);
    return Promise.resolve(response);*/
  }
}

const token = "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";
const client = new GitHubClient("olivermking/k8s-bake", token);
console.log(await client.getWorkflows());
