import * as toolCache from '@actions/tool-cache';
import * as core from '@actions/core';
import * as io from '@actions/io';
import * as path from 'path';

import { getExecutableExtension, isEqual } from "./utility";
import { downloadKubectl, getStableKubectlVersion } from "./kubectl-util";
import { deploy } from './strategy/DeploymentHelper';
import { Kubectl } from './kubectl-object-model';

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
    let strategy = core.getInput('deployment-strategy');
    console.log("strategy: ", strategy)
    await deploy(new Kubectl(kubectlPath, namespace), manifests, strategy);
}

run().catch(core.setFailed);