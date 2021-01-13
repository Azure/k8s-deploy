import * as core from '@actions/core';
import * as io from '@actions/io';
import * as path from 'path';
import * as toolCache from '@actions/tool-cache';

import { downloadKubectl, getStableKubectlVersion } from "./utilities/kubectl-util";
import { getDeploymentConfig, getExecutableExtension, isEqual, isValidAction } from "./utilities/utility";

import { Kubectl } from './kubectl-object-model';
import { deploy } from './utilities/strategy-helpers/deployment-helper';
import { promote } from './actions/promote';
import { reject } from './actions/reject';
import * as AzureTraceabilityHelper from "./traceability/azure-traceability-helper";

let kubectlPath = "";

async function setKubectlPath() {
    if (core.getInput('kubectl-version')) {
        const version = core.getInput('kubectl-version');
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

export async function run() {
    checkClusterContext();
    await setKubectlPath();
    let manifestsInput = core.getInput('manifests');
    if (!manifestsInput) {
        core.setFailed('No manifests supplied to deploy');
        return;
    }
    let namespace = core.getInput('namespace');
    if (!namespace) {
        namespace = 'default';
    }
    let action = core.getInput('action');
    let manifests = manifestsInput.split('\n');

    if (!isValidAction(action)) {
        core.setFailed('Not a valid action. The allowed actions are deploy, promote, reject');
    }
    else {
        const kubectl = new Kubectl(kubectlPath, namespace, true);
        const deploymentConfig = await getDeploymentConfig();
        let runStatus = 'success';
        try {
            if (action === 'deploy') {
                let strategy = core.getInput('strategy');
                console.log("strategy: ", strategy)
                await deploy(kubectl, manifests, strategy, deploymentConfig);
            }
            else if (action === 'promote') {
                await promote(kubectl, deploymentConfig);
            }
            else if (action === 'reject') {
                await reject(kubectl);
            }
        }
        catch(error) {
            runStatus = 'failure';
            throw error;
        }
        finally {
            await AzureTraceabilityHelper.addTraceability(kubectl, deploymentConfig, runStatus);
        }
    }
}

run().catch(core.setFailed);