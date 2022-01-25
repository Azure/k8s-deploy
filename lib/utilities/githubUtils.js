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
exports.isHttpUrl = exports.getNormalizedPath = exports.normalizeWorkflowStrLabel = exports.getWorkflowFilePath = void 0;
const githubClient_1 = require("../types/githubClient");
const core = require("@actions/core");
function getWorkflowFilePath(githubToken) {
    return __awaiter(this, void 0, void 0, function* () {
        let workflowFilePath = process.env.GITHUB_WORKFLOW;
        if (!workflowFilePath.startsWith(".github/workflows/")) {
            const githubClient = new githubClient_1.GitHubClient(process.env.GITHUB_REPOSITORY, githubToken);
            const response = yield githubClient.getWorkflows();
            if (response) {
                if (response.status === githubClient_1.OkStatusCode && response.data.total_count) {
                    if (response.data.total_count > 0) {
                        for (const workflow of response.data.workflows) {
                            if (process.env.GITHUB_WORKFLOW === workflow.name) {
                                workflowFilePath = workflow.path;
                                break;
                            }
                        }
                    }
                }
                else if (response.status != githubClient_1.OkStatusCode) {
                    core.error(`An error occurred while getting list of workflows on the repo. Status code: ${response.status}`);
                }
            }
            else {
                core.error(`Failed to get response from workflow list API`);
            }
        }
        return Promise.resolve(workflowFilePath);
    });
}
exports.getWorkflowFilePath = getWorkflowFilePath;
function normalizeWorkflowStrLabel(workflowName) {
    const workflowsPath = ".github/workflows/";
    workflowName = workflowName.startsWith(workflowsPath)
        ? workflowName.replace(workflowsPath, "")
        : workflowName;
    return workflowName.replace(/ /g, "_");
}
exports.normalizeWorkflowStrLabel = normalizeWorkflowStrLabel;
function getNormalizedPath(pathValue) {
    if (!isHttpUrl(pathValue)) {
        //if it is not an http url then convert to link from current repo and commit
        return `https://github.com/${process.env.GITHUB_REPOSITORY}/blob/${process.env.GITHUB_SHA}/${pathValue}`;
    }
    return pathValue;
}
exports.getNormalizedPath = getNormalizedPath;
function isHttpUrl(url) {
    return /^https?:\/\/.*$/.test(url);
}
exports.isHttpUrl = isHttpUrl;
