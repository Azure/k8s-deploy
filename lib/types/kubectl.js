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
exports.getKubectlPath = exports.Kubectl = void 0;
const exec_1 = require("@actions/exec");
const arrayUtils_1 = require("../utilities/arrayUtils");
const core = require("@actions/core");
const toolCache = require("@actions/tool-cache");
const io = require("@actions/io");
class Kubectl {
    constructor(kubectlPath, namespace = "default", ignoreSSLErrors = false) {
        this.kubectlPath = kubectlPath;
        this.ignoreSSLErrors = !!ignoreSSLErrors;
        this.namespace = namespace;
    }
    apply(configurationPaths, force = false) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (!configurationPaths || (configurationPaths === null || configurationPaths === void 0 ? void 0 : configurationPaths.length) === 0)
                    throw Error("Configuration paths must exist");
                const applyArgs = [
                    "apply",
                    "-f",
                    arrayUtils_1.createInlineArray(configurationPaths),
                ];
                if (force)
                    applyArgs.push("--force");
                return yield this.execute(applyArgs);
            }
            catch (err) {
                core.debug("Kubectl apply failed:" + err);
            }
        });
    }
    describe(resourceType, resourceName, silent = false) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.execute(["describe", resourceType, resourceName], silent);
        });
    }
    getNewReplicaSet(deployment) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield this.describe("deployment", deployment, true);
            let newReplicaSet = "";
            if (result === null || result === void 0 ? void 0 : result.stdout) {
                const stdout = result.stdout.split("\n");
                stdout.forEach((line) => {
                    const newreplicaset = "newreplicaset";
                    if (line && line.toLowerCase().indexOf(newreplicaset) > -1)
                        newReplicaSet = line
                            .substring(newreplicaset.length)
                            .trim()
                            .split(" ")[0];
                });
            }
            return newReplicaSet;
        });
    }
    annotate(resourceType, resourceName, annotation) {
        return __awaiter(this, void 0, void 0, function* () {
            const args = [
                "annotate",
                resourceType,
                resourceName,
                annotation,
                "--overwrite",
            ];
            return yield this.execute(args);
        });
    }
    annotateFiles(files, annotation) {
        return __awaiter(this, void 0, void 0, function* () {
            const args = [
                "annotate",
                "-f",
                arrayUtils_1.createInlineArray(files),
                annotation,
                "--overwrite",
            ];
            return yield this.execute(args);
        });
    }
    labelFiles(files, labels) {
        return __awaiter(this, void 0, void 0, function* () {
            const args = [
                "label",
                "-f",
                arrayUtils_1.createInlineArray(files),
                ...labels,
                "--overwrite",
            ];
            return yield this.execute(args);
        });
    }
    getAllPods() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.execute(["get", "pods", "-o", "json"], true);
        });
    }
    checkRolloutStatus(resourceType, name) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.execute(["rollout", "status", `${resourceType}/${name}`]);
        });
    }
    getResource(resourceType, name) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.execute(["get", `${resourceType}/${name}`, "-o", "json"]);
        });
    }
    executeCommand(command, args) {
        if (!command)
            throw new Error("Command must be defined");
        return args ? this.execute([command, args]) : this.execute([command]);
    }
    delete(args) {
        if (typeof args === "string")
            return this.execute(["delete", args]);
        return this.execute(["delete", ...args]);
    }
    execute(args, silent = false) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.ignoreSSLErrors) {
                args.push("--insecure-skip-tls-verify");
            }
            args = args.concat(["--namespace", this.namespace]);
            return yield exec_1.getExecOutput(this.kubectlPath, args, { silent });
        });
    }
}
exports.Kubectl = Kubectl;
function getKubectlPath() {
    return __awaiter(this, void 0, void 0, function* () {
        const version = core.getInput("kubectl-version");
        const kubectlPath = version
            ? toolCache.find("kubectl", version)
            : yield io.which("kubectl", true);
        if (!kubectlPath)
            throw Error("kubectl not found. You must install it before running this action");
        return kubectlPath;
    });
}
exports.getKubectlPath = getKubectlPath;
