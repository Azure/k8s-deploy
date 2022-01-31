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
const kubectl_1 = require("./types/kubectl");
const deploy_1 = require("./actions/deploy");
const promote_1 = require("./actions/promote");
const reject_1 = require("./actions/reject");
const action_1 = require("./types/action");
const deploymentStrategy_1 = require("./types/deploymentStrategy");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        // verify kubeconfig is set
        if (!process.env["KUBECONFIG"])
            core.warning("KUBECONFIG env is not explicitly set. Ensure cluster context is set by using k8s-set-context action.");
        // get inputs
        const action = action_1.parseAction(core.getInput("action", { required: true }));
        const strategy = deploymentStrategy_1.parseDeploymentStrategy(core.getInput("strategy"));
        const manifestsInput = core.getInput("manifests", { required: true });
        const manifestFilePaths = manifestsInput
            .split(/[\n,;]+/) // split into each individual manifest
            .map((manifest) => manifest.trim()) // remove surrounding whitespace
            .filter((manifest) => manifest.length > 0); // remove any blanks
        // create kubectl
        const kubectlPath = yield kubectl_1.getKubectlPath();
        const namespace = core.getInput("namespace") || "default";
        const kubectl = new kubectl_1.Kubectl(kubectlPath, namespace, true);
        // run action
        switch (action) {
            case action_1.Action.DEPLOY: {
                yield deploy_1.deploy(kubectl, manifestFilePaths, strategy);
                break;
            }
            case action_1.Action.PROMOTE: {
                yield promote_1.promote(kubectl, manifestFilePaths, strategy);
                break;
            }
            case action_1.Action.REJECT: {
                yield reject_1.reject(kubectl, manifestFilePaths, strategy);
                break;
            }
            default: {
                throw Error('Not a valid action. The allowed actions are "deploy", "promote", and "reject".');
            }
        }
    });
}
exports.run = run;
run().catch((error) => {
    core.error(error.stack());
    core.setFailed(error);
});
