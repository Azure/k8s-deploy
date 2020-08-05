import * as core from '@actions/core';
import { WebRequest, WebResponse, sendRequest } from "./utilities/httpClient";

export class GitHubClient {
    constructor(repository: string, token: string) {
        this._repository = repository;
        this._token = token;
    }

    public async getSuccessfulRunsOnBranch(branch: string, workflowFileName: string, force?: boolean): Promise<any> {
        if (force || !this._successfulRunsOnBranchPromise) {
            const lastSuccessfulRunUrl = `https://api.github.com/repos/${this._repository}/actions/workflows/${workflowFileName}/runs?status=success&branch=${branch}`;
            const webRequest = new WebRequest();
            webRequest.method = "GET";
            webRequest.uri = lastSuccessfulRunUrl;
            webRequest.headers = {
                Authorization: `Bearer ${this._token}`
            };

            core.debug(`Getting last successful run for repo: ${this._repository} on branch: ${branch}`);
            const response: WebResponse = await sendRequest(webRequest);
            this._successfulRunsOnBranchPromise = Promise.resolve(response);
        }
        return this._successfulRunsOnBranchPromise;
    }

    public async getWorkflows(force?: boolean): Promise<any> {
        if (force || !this._workflowsPromise) {
            const getWorkflowFileNameUrl = `https://api.github.com/repos/${this._repository}/actions/workflows`;
            const webRequest = new WebRequest();
            webRequest.method = "GET";
            webRequest.uri = getWorkflowFileNameUrl;
            webRequest.headers = {
                Authorization: `Bearer ${this._token}`
            };

            core.debug(`Getting workflows for repo: ${this._repository}`);
            const response: WebResponse = await sendRequest(webRequest);
            this._workflowsPromise = Promise.resolve(response);
        }
        return this._workflowsPromise;
    }

    private _repository: string;
    private _token: string;
    private _successfulRunsOnBranchPromise: Promise<any>;
    private _workflowsPromise: Promise<any>;
}