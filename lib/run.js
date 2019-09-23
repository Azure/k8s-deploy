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
const toolrunner_1 = require("@actions/exec/lib/toolrunner");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");
const utils_1 = require("./utils");
const kubernetes_utils_1 = require("./kubernetes-utils");
const kubectl_util_1 = require("./kubectl-util");
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
                kubectlPath = path.join(kubectlPath, `kubectl${utils_1.getExecutableExtension()}`);
            }
        }
    });
}
function deploy(manifests, namespace) {
    return __awaiter(this, void 0, void 0, function* () {
        if (manifests) {
            for (var i = 0; i < manifests.length; i++) {
                let manifest = manifests[i];
                let toolRunner = new toolrunner_1.ToolRunner(kubectlPath, ['apply', '-f', manifest, '--namespace', namespace]);
                yield toolRunner.exec();
            }
        }
    });
}
function checkRolloutStatus(name, kind, namespace) {
    return __awaiter(this, void 0, void 0, function* () {
        const toolrunner = new toolrunner_1.ToolRunner(kubectlPath, ['rollout', 'status', `${kind.trim()}/${name.trim()}`, `--namespace`, namespace]);
        return toolrunner.exec();
    });
}
function checkManifestsStability(manifests, namespace) {
    return __awaiter(this, void 0, void 0, function* () {
        manifests.forEach((manifest) => {
            let content = fs.readFileSync(manifest).toString();
            yaml.safeLoadAll(content, function (inputObject) {
                return __awaiter(this, void 0, void 0, function* () {
                    if (!!inputObject.kind && !!inputObject.metadata && !!inputObject.metadata.name) {
                        let kind = inputObject.kind;
                        switch (kind.toLowerCase()) {
                            case 'deployment':
                            case 'daemonset':
                            case 'statefulset':
                                yield checkRolloutStatus(inputObject.metadata.name, kind, namespace);
                                break;
                            default:
                                core.debug(`No rollout check for kind: ${inputObject.kind}`);
                        }
                    }
                });
            });
        });
    });
}
function getManifestFileName(kind, name) {
    const filePath = kind + '_' + name + '_' + utils_1.getCurrentTime().toString();
    const tempDirectory = process.env['RUNNER_TEMP'];
    const fileName = path.join(tempDirectory, path.basename(filePath));
    return fileName;
}
function writeObjectsToFile(inputObjects) {
    const newFilePaths = [];
    if (!!inputObjects) {
        inputObjects.forEach((inputObject) => {
            try {
                const inputObjectString = JSON.stringify(inputObject);
                if (!!inputObject.kind && !!inputObject.metadata && !!inputObject.metadata.name) {
                    const fileName = getManifestFileName(inputObject.kind, inputObject.metadata.name);
                    fs.writeFileSync(path.join(fileName), inputObjectString);
                    newFilePaths.push(fileName);
                }
                else {
                    core.debug('Input object is not proper K8s resource object. Object: ' + inputObjectString);
                }
            }
            catch (ex) {
                core.debug('Exception occurred while wrting object to file : ' + inputObject + ' . Exception: ' + ex);
            }
        });
    }
    return newFilePaths;
}
function updateManifests(manifests, imagesToOverride, imagepullsecrets) {
    const newObjectsList = [];
    manifests.forEach((filePath) => {
        let fileContents = fs.readFileSync(filePath).toString();
        fileContents = kubernetes_utils_1.updateContainerImagesInManifestFiles(fileContents, imagesToOverride.split('\n'));
        yaml.safeLoadAll(fileContents, function (inputObject) {
            if (!!imagepullsecrets && !!inputObject && !!inputObject.kind) {
                if (kubernetes_utils_1.isWorkloadEntity(inputObject.kind)) {
                    kubernetes_utils_1.updateImagePullSecrets(inputObject, imagepullsecrets.split('\n'));
                }
            }
            newObjectsList.push(inputObject);
        });
    });
    return writeObjectsToFile(newObjectsList);
}
function installKubectl(version) {
    return __awaiter(this, void 0, void 0, function* () {
        if (utils_1.isEqual(version, 'latest')) {
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
        const imagesToOverride = core.getInput('images');
        const imagePullSecretsToAdd = core.getInput('imagepullsecrets');
        if (!!imagePullSecretsToAdd || !!imagesToOverride) {
            manifests = updateManifests(manifests, imagesToOverride, imagePullSecretsToAdd);
        }
        yield deploy(manifests, namespace);
        yield checkManifestsStability(manifests, namespace);
    });
}
run().catch(core.setFailed);
