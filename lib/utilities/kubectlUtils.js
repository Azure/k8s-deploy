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
exports.annotateChildPods = exports.getLastSuccessfulRunSha = exports.checkForErrors = void 0;
const core = require("@actions/core");
function checkForErrors(execResults, warnIfError) {
    let stderr = "";
    execResults.forEach((result) => {
        if ((result === null || result === void 0 ? void 0 : result.exitCode) !== 0) {
            stderr += (result === null || result === void 0 ? void 0 : result.stderr) + " \n";
        }
        else if (result === null || result === void 0 ? void 0 : result.stderr) {
            core.warning(result.stderr);
        }
    });
    if (stderr.length > 0) {
        if (warnIfError) {
            core.warning(stderr.trim());
        }
        else {
            throw new Error(stderr.trim());
        }
    }
}
exports.checkForErrors = checkForErrors;
function getLastSuccessfulRunSha(kubectl, namespaceName, annotationKey) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const result = yield kubectl.getResource("namespace", namespaceName);
            if (result === null || result === void 0 ? void 0 : result.stderr) {
                core.warning(result.stderr);
                return process.env.GITHUB_SHA;
            }
            else if (result === null || result === void 0 ? void 0 : result.stdout) {
                const annotationsSet = JSON.parse(result.stdout).metadata.annotations;
                if (annotationsSet && annotationsSet[annotationKey]) {
                    return JSON.parse(annotationsSet[annotationKey].replace(/'/g, '"'))
                        .commit;
                }
                else {
                    return "NA";
                }
            }
        }
        catch (ex) {
            core.warning(`Failed to get commits from cluster. ${JSON.stringify(ex)}`);
            return "";
        }
    });
}
exports.getLastSuccessfulRunSha = getLastSuccessfulRunSha;
function annotateChildPods(kubectl, resourceType, resourceName, annotationKeyValStr, allPods) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        let owner = resourceName;
        if (resourceType.toLowerCase().indexOf("deployment") > -1) {
            owner = yield kubectl.getNewReplicaSet(resourceName);
        }
        const commandExecutionResults = [];
        if ((allPods === null || allPods === void 0 ? void 0 : allPods.items) && ((_a = allPods.items) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            allPods.items.forEach((pod) => {
                var _a;
                const owners = (_a = pod === null || pod === void 0 ? void 0 : pod.metadata) === null || _a === void 0 ? void 0 : _a.ownerReferences;
                if (owners) {
                    for (const ownerRef of owners) {
                        if (ownerRef.name === owner) {
                            commandExecutionResults.push(kubectl.annotate("pod", pod.metadata.name, annotationKeyValStr));
                            break;
                        }
                    }
                }
            });
        }
        return yield Promise.all(commandExecutionResults);
    });
}
exports.annotateChildPods = annotateChildPods;
