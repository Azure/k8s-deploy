import * as core from '@actions/core';
import { WebRequest, WebResponse, sendRequest } from "./utilities/httpClient";

export class GitHubClient {
    constructor(repository: string, token: string) {
        this._repository = repository;
        this._token = token;
    }

    public async getWorkflows(): Promise<any> {
        const getWorkflowFileNameUrl = `https://api.github.com/repos/${this._repository}/actions/workflows`;
        const webRequest = new WebRequest();
        webRequest.method = "GET";
        webRequest.uri = getWorkflowFileNameUrl;
        webRequest.headers = {
            Authorization: `Bearer ${this._token}`
        };

        core.debug(`Getting workflows for repo: ${this._repository}`);
        const response: WebResponse = await sendRequest(webRequest);
        return Promise.resolve(response);
    }

    public async getRepo(): Promise<any> {
        const getRepoUrl = `https://api.github.com/repos/${this._repository}`;
        const webRequest = new WebRequest();
        webRequest.method = "GET";
        webRequest.uri = getRepoUrl;
        webRequest.headers = {
            Authorization: `Bearer ${this._token}`
        };

        core.debug(`Getting repo details for repo: ${this._repository}`);
        const response: WebResponse = await sendRequest(webRequest);
        return Promise.resolve(response);
    }

    private _repository: string;
    private _token: string;
} 