import * as core from '@actions/core';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as toolCache from '@actions/tool-cache';
import * as util from 'util';

import { Kubectl } from '../kubectl-object-model';

const kubectlToolName = 'kubectl';
const stableKubectlVersion = 'v1.15.0';
const stableVersionUrl = 'https://storage.googleapis.com/kubernetes-release/release/stable.txt';
const trafficSplitAPIVersionPrefix = 'split.smi-spec.io';

function getExecutableExtension(): string {
    if (os.type().match(/^Win/)) {
        return '.exe';
    }
    return '';
}

export function getkubectlDownloadURL(version: string): string {
    switch (os.type()) {
        case 'Linux':
            return util.format('https://storage.googleapis.com/kubernetes-release/release/%s/bin/linux/amd64/kubectl', version);

        case 'Darwin':
            return util.format('https://storage.googleapis.com/kubernetes-release/release/%s/bin/darwin/amd64/kubectl', version);

        case 'Windows_NT':
        default:
            return util.format('https://storage.googleapis.com/kubernetes-release/release/%s/bin/windows/amd64/kubectl.exe', version);

    }
}

export async function getStableKubectlVersion(): Promise<string> {
    return toolCache.downloadTool(stableVersionUrl).then((downloadPath) => {
        let version = fs.readFileSync(downloadPath, 'utf8').toString().trim();
        if (!version) {
            version = stableKubectlVersion;
        }
        return version;
    }, (error) => {
        core.debug(error);
        core.warning('GetStableVersionFailed');
        return stableKubectlVersion;
    });
}

export async function downloadKubectl(version: string): Promise<string> {
    let cachedToolpath = toolCache.find(kubectlToolName, version);
    let kubectlDownloadPath = '';
    if (!cachedToolpath) {
        try {
            kubectlDownloadPath = await toolCache.downloadTool(getkubectlDownloadURL(version));
        } catch (exception) {
            throw new Error('DownloadKubectlFailed');
        }

        cachedToolpath = await toolCache.cacheFile(kubectlDownloadPath, kubectlToolName + getExecutableExtension(), kubectlToolName, version);
    }

    const kubectlPath = path.join(cachedToolpath, kubectlToolName + getExecutableExtension());
    fs.chmodSync(kubectlPath, '777');
    return kubectlPath;
}

export function getTrafficSplitAPIVersion(kubectl: Kubectl): string {
    const result = kubectl.executeCommand('api-versions');
    const trafficSplitAPIVersion = result.stdout.split('\n').find(version => version.startsWith(trafficSplitAPIVersionPrefix));
    if (!trafficSplitAPIVersion) {
        throw new Error('UnableToCreateTrafficSplitManifestFile');
    }

    return trafficSplitAPIVersion;
}