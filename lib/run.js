"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const toolCache = require("@actions/tool-cache");
const core = require("@actions/core");
const io = require("@actions/io");
const path = require("path");
const utility_1 = require("./utility");
const kubectl_util_1 = require("./kubectl-util");
const DeploymentHelper_1 = require("./strategy/DeploymentHelper");
const kubectl_object_model_1 = require("./kubectl-object-model");
let kubectlPath = "";
function setKubectlPath() {
    return __awaiter(this, void 0, void 0, function* () {
        if (core.getInput('kubectl-version')) {
            const version = core.getInput('kubect-version');
            kubectlPath = toolCache.find('kubectl', version);
            if (!kubectlPath) {
                kubectlPath = yield installKubectl(version);
            }
        }
        else {
            kubectlPath = yield io.which('kubectl', false);
            if (!kubectlPath) {
                const allVersions = toolCache.findAllVersions('kubectl');
                kubectlPath = allVersions.length > 0 ? toolCache.find('kubectl', allVersions[0]) : '';
                if (!kubectlPath) {
                    throw new Error('Kubectl is not installed, either add install-kubectl action or provide "kubectl-version" input to download kubectl');
                }
                kubectlPath = path.join(kubectlPath, `kubectl${utility_1.getExecutableExtension()}`);
            }
        }
    });
}
function installKubectl(version) {
    return __awaiter(this, void 0, void 0, function* () {
        if (utility_1.isEqual(version, 'latest')) {
            version = yield kubectl_util_1.getStableKubectlVersion();
        }
        return yield kubectl_util_1.downloadKubectl(version);
    });
}
function checkClusterContext() {
    if (!process.env["KUBECONFIG"]) {
        throw new Error('Cluster context not set. Use k8ssetcontext action to set cluster context');
    }
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        checkClusterContext();
        yield setKubectlPath();
        let manifestsInput = core.getInput('manifests');
        if (!manifestsInput) {
            core.setFailed('No manifests supplied to deploy');
        }
        let namespace = core.getInput('namespace');
        if (!namespace) {
            namespace = 'default';
        }
        let manifests = manifestsInput.split('\n');
        let strategy = core.getInput('deployment-strategy');
        console.log("strategy: ", strategy);
        yield DeploymentHelper_1.deploy(new kubectl_object_model_1.Kubectl(kubectlPath, namespace), manifests, strategy);
    });
}
run().catch(core.setFailed);
