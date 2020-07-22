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
class GitHubClient {
    constructor(repository, token) {
        this._repository = repository;
        this._token = token;
    }
    getSuccessfulRunsOnBranch(branch, force) {
        return __awaiter(this, void 0, void 0, function* () {
            if (force || !this._successfulRunsOnBranchPromise) {
                const lastSuccessfulRunUrl = `https://api.github.com/repos/${this._repository}/actions/runs?status=success&branch=${branch}`;
                const webRequest = new httpClient_1.WebRequest();
                webRequest.method = "GET";
                webRequest.uri = lastSuccessfulRunUrl;
                webRequest.headers = {
                    Authorization: `Bearer ${this._token}`
                };
                core.debug(`Getting last successful run for repo: ${this._repository} on branch: ${branch}`);
                const response = yield httpClient_1.sendRequest(webRequest);
                this._successfulRunsOnBranchPromise = Promise.resolve(response);
            }
            return this._successfulRunsOnBranchPromise;
        });
    }
}
exports.GitHubClient = GitHubClient;
