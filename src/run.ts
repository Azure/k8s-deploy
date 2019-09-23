import * as toolCache from '@actions/tool-cache';
import * as core from '@actions/core';
import * as io from '@actions/io';
import { ToolRunner } from "@actions/exec/lib/toolrunner";

import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { getExecutableExtension, isEqual, getCurrentTime } from "./utils";
import { isWorkloadEntity, updateContainerImagesInManifestFiles, updateImagePullSecrets } from "./kubernetes-utils";
import { downloadKubectl, getStableKubectlVersion } from "./kubectl-util";

let kubectlPath = "";

async function setKubectlPath() {
    if (core.getInput('kubectl-version')) {
        const version = core.getInput('kubect-version');
        kubectlPath = toolCache.find('kubectl', version);
        if (!kubectlPath) {
            kubectlPath = await installKubectl(version);
        }
    } else {
        kubectlPath = await io.which('kubectl', false);
        if (!kubectlPath) {
            const allVersions = toolCache.findAllVersions('kubectl');
            kubectlPath = allVersions.length > 0 ? toolCache.find('kubectl', allVersions[0]) : '';
            if (!kubectlPath) {
                throw new Error('Kubectl is not installed, either add install-kubectl action or provide "kubectl-version" input to download kubectl');
            }
            kubectlPath = path.join(kubectlPath, `kubectl${getExecutableExtension()}`);
        }
    }
}

async function deploy(manifests: string[], namespace: string) {
    if (manifests) {
        for (var i = 0; i < manifests.length; i++) {
            let manifest = manifests[i];
            let toolRunner = new ToolRunner(kubectlPath, ['apply', '-f', manifest, '--namespace', namespace]);
            await toolRunner.exec();
        }
    }
}

async function checkRolloutStatus(name: string, kind: string, namespace: string) {
    const toolrunner = new ToolRunner(kubectlPath, ['rollout', 'status', `${kind.trim()}/${name.trim()}`, `--namespace`, namespace]);
    return toolrunner.exec();
}

async function checkManifestsStability(manifests: string[], namespace: string) {
    manifests.forEach((manifest) => {
        let content = fs.readFileSync(manifest).toString();
        yaml.safeLoadAll(content, async function (inputObject: any) {
            if (!!inputObject.kind && !!inputObject.metadata && !!inputObject.metadata.name) {
                let kind: string = inputObject.kind;
                switch (kind.toLowerCase()) {
                    case 'deployment':
                    case 'daemonset':
                    case 'statefulset':
                        await checkRolloutStatus(inputObject.metadata.name, kind, namespace);
                        break;
                    default:
                        core.debug(`No rollout check for kind: ${inputObject.kind}`)
                }
            }
        });
    });
}

function getManifestFileName(kind: string, name: string) {
    const filePath = kind + '_' + name + '_' + getCurrentTime().toString();
    const tempDirectory = process.env['RUNNER_TEMP'];
    const fileName = path.join(tempDirectory, path.basename(filePath));
    return fileName;
}

function writeObjectsToFile(inputObjects: any[]): string[] {
    const newFilePaths = [];

    if (!!inputObjects) {
        inputObjects.forEach((inputObject: any) => {
            try {
                const inputObjectString = JSON.stringify(inputObject);
                if (!!inputObject.kind && !!inputObject.metadata && !!inputObject.metadata.name) {
                    const fileName = getManifestFileName(inputObject.kind, inputObject.metadata.name);
                    fs.writeFileSync(path.join(fileName), inputObjectString);
                    newFilePaths.push(fileName);
                } else {
                    core.debug('Input object is not proper K8s resource object. Object: ' + inputObjectString);
                }
            } catch (ex) {
                core.debug('Exception occurred while wrting object to file : ' + inputObject + ' . Exception: ' + ex);
            }
        });
    }

    return newFilePaths;
}

function updateManifests(manifests: string[], imagesToOverride: string, imagepullsecrets: string): string[] {
    const newObjectsList = [];
    manifests.forEach((filePath: string) => {
        let fileContents = fs.readFileSync(filePath).toString();
        fileContents = updateContainerImagesInManifestFiles(fileContents, imagesToOverride.split('\n'));
        yaml.safeLoadAll(fileContents, function (inputObject: any) {
            if (!!imagepullsecrets && !!inputObject && !!inputObject.kind) {
                if (isWorkloadEntity(inputObject.kind)) {
                    updateImagePullSecrets(inputObject, imagepullsecrets.split('\n'));
                }
            }
            newObjectsList.push(inputObject);
        });

    });

    return writeObjectsToFile(newObjectsList);
}

async function installKubectl(version: string) {
    if (isEqual(version, 'latest')) {
        version = await getStableKubectlVersion();
    }
    return await downloadKubectl(version);
}

function checkClusterContext() {
    if (!process.env["KUBECONFIG"]) {
        throw new Error('Cluster context not set. Use k8ssetcontext action to set cluster context');
    }
}

async function run() {
    checkClusterContext();
    await setKubectlPath();
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
        manifests = updateManifests(manifests, imagesToOverride, imagePullSecretsToAdd)
    }
    await deploy(manifests, namespace);
    await checkManifestsStability(manifests, namespace);
}

run().catch(core.setFailed);