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
exports.getTrafficSplitAPIVersion = exports.downloadKubectl = exports.getStableKubectlVersion = exports.getkubectlDownloadURL = void 0;
const core = require("@actions/core");
const fs = require("fs");
const os = require("os");
const path = require("path");
const toolCache = require("@actions/tool-cache");
const util = require("util");
const httpClient_1 = require("./httpClient");
const kubectlToolName = 'kubectl';
const stableKubectlVersion = 'v1.15.0';
const stableVersionUrl = 'https://storage.googleapis.com/kubernetes-release/release/stable.txt';
const trafficSplitAPIVersionPrefix = 'split.smi-spec.io';
function getExecutableExtension() {
    if (os.type().match(/^Win/)) {
        return '.exe';
    }
    return '';
}
function getKubectlArch() {
    let arch = os.arch();
    if (arch === 'x64') {
        return 'amd64';
    }
    return arch;
}
function getkubectlDownloadURL(version, arch) {
    switch (os.type()) {
        case 'Linux':
            return util.format('https://storage.googleapis.com/kubernetes-release/release/%s/bin/linux/%s/kubectl', version, arch);
        case 'Darwin':
            return util.format('https://storage.googleapis.com/kubernetes-release/release/%s/bin/darwin/%s/kubectl', version, arch);
        case 'Windows_NT':
        default:
            return util.format('https://storage.googleapis.com/kubernetes-release/release/%s/bin/windows/%s/kubectl.exe', version, arch);
    }
}
exports.getkubectlDownloadURL = getkubectlDownloadURL;
function getStableKubectlVersion() {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
exports.getStableKubectlVersion = getStableKubectlVersion;
function downloadKubectl(version) {
    return __awaiter(this, void 0, void 0, function* () {
        let cachedToolpath = toolCache.find(kubectlToolName, version);
        let kubectlDownloadPath = '';
        let arch = getKubectlArch();
        if (!cachedToolpath) {
            try {
                kubectlDownloadPath = yield toolCache.downloadTool(getkubectlDownloadURL(version, arch));
            }
            catch (exception) {
                if (exception instanceof toolCache.HTTPError && exception.httpStatusCode === httpClient_1.StatusCodes.NOT_FOUND) {
                    throw new Error(util.format("Kubectl '%s' for '%s' arch not found.", version, arch));
                }
                else {
                    throw new Error('DownloadKubectlFailed');
                }
            }
            cachedToolpath = yield toolCache.cacheFile(kubectlDownloadPath, kubectlToolName + getExecutableExtension(), kubectlToolName, version);
        }
        const kubectlPath = path.join(cachedToolpath, kubectlToolName + getExecutableExtension());
        fs.chmodSync(kubectlPath, '777');
        return kubectlPath;
    });
}
exports.downloadKubectl = downloadKubectl;
function getTrafficSplitAPIVersion(kubectl) {
    const result = kubectl.executeCommand('api-versions');
    const trafficSplitAPIVersion = result.stdout.split('\n').find(version => version.startsWith(trafficSplitAPIVersionPrefix));
    if (!trafficSplitAPIVersion) {
        throw new Error('UnableToCreateTrafficSplitManifestFile');
    }
    return trafficSplitAPIVersion;
}
exports.getTrafficSplitAPIVersion = getTrafficSplitAPIVersion;
