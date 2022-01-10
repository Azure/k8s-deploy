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
exports.run = void 0;
const core = require("@actions/core");
const io = require("@actions/io");
const toolCache = require("@actions/tool-cache");
const kubectl_1 = require("./types/kubectl");
const deploy_1 = require("./deploy/deploy");
const promote_1 = require("./actions/promote");
const reject_1 = require("./actions/reject");
const action_1 = require("./types/action");
const deploymentStrategy_1 = require("./types/deploymentStrategy");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!process.env["KUBECONFIG"]) {
            core.warning("KUBECONFIG env is not explicitly set. Ensure cluster context is set by using k8s-set-context action.");
            const action = action_1.parseAction(core.getInput("action", { required: true }));
            switch (action) {
                case action_1.Action.DEPLOY: {
                    // get inputs
                    const strategy = deploymentStrategy_1.parseDeploymentStrategy(core.getInput("strategy"));
                    const manifestsInput = core.getInput("manifests", { required: true });
                    const manifestFilePaths = manifestsInput
                        .split(/[\n,;]+/) // split into each individual manifest
                        .map((manifest) => manifest.trim()) // remove surrounding whitespace
                        .filter((manifest) => manifest.length > 0); // remove any blanks
                    const kubectlPath = yield getKubectlPath();
                    const namespace = core.getInput("namespace") || "default";
                    const kubectl = new kubectl_1.Kubectl(kubectlPath, namespace);
                    yield deploy_1.deploy(manifestFilePaths, strategy, kubectl);
                    break;
                }
                case action_1.Action.PROMOTE: {
                    yield promote_1.promote();
                    break;
                }
                case action_1.Action.REJECT: {
                    yield reject_1.reject();
                    break;
                }
                default: {
                    throw Error('Not a valid action. The allowed actions are "deploy", "promote", and "reject".');
                }
            }
        }
        function getKubectlPath() {
            return __awaiter(this, void 0, void 0, function* () {
                const version = core.getInput("kubectl-version");
                const kubectlPath = version
                    ? toolCache.find("kubectl", version)
                    : yield io.which("kubectl", false);
                if (!kubectlPath)
                    throw Error("kubectl not found. You must install it before running this action");
                return kubectlPath;
            });
        }
    });
}
exports.run = run;
run().catch(core.setFailed);
