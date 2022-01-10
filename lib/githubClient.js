"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubClient = void 0;
const core = require("@actions/core");
const httpClient_1 = require("./utilities/httpClient");
const core_1 = require("@octokit/core");
const plugin_retry_1 = require("@octokit/plugin-retry");
const RetryOctokit = core_1.Octokit.plugin(plugin_retry_1.retry);
const RETRY_COUNT = 5;
class GitHubClient {
    constructor(repository, token) {
        this.repository = repository;
        this.token = token;
    }
    getWorkflows() {
        return __awaiter(this, void 0, void 0, function* () {
            const octokit = new RetryOctokit({
                auth: this.token,
                request: { retries: RETRY_COUNT },
            });
            core.debug(`Getting workflows for repo: ${this.repository}`);
            return Promise.resolve(yield octokit.request(`GET /repos/${this.repository}/actions/workflows`));
            const getWorkflowFileNameUrl = `https://api.github.com`;
            const webRequest = new httpClient_1.WebRequest();
            webRequest.method = "GET";
            webRequest.uri = getWorkflowFileNameUrl;
            webRequest.headers = {
                Authorization: `Bearer ${this.token}`,
            };
            const response = yield httpClient_1.sendRequest(webRequest);
            return Promise.resolve(response);
        });
    }
}
exports.GitHubClient = GitHubClient;
const token = "";
const client = new GitHubClient("k8s-bake", token);
console.log(client.getWorkflows());
