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
exports.GitHubClient = exports.OkStatusCode = void 0;
const core = require("@actions/core");
const core_1 = require("@octokit/core");
const plugin_retry_1 = require("@octokit/plugin-retry");
exports.OkStatusCode = 200;
const RetryOctokit = core_1.Octokit.plugin(plugin_retry_1.retry);
const RETRY_COUNT = 5;
const requestUrl = "GET /repos/{owner}/{repo}/actions/workflows";
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
            const [owner, repo] = this.repository.split("/");
            core.debug(`Getting workflows for repo: ${this.repository}`);
            return Promise.resolve(yield octokit.request(requestUrl, {
                owner,
                repo,
            }));
        });
    }
}
exports.GitHubClient = GitHubClient;
