import * as KubernetesManifestUtility from '../src/utilities/manifest-stability-utility';
import * as KubernetesObjectUtility from '../src/utilities/resource-object-utility';
import * as action from '../src/run';
import * as core from '@actions/core';
import * as deployment from '../src/utilities/strategy-helpers/deployment-helper';
import * as fs from 'fs';
import * as io from '@actions/io';
import * as toolCache from '@actions/tool-cache';

import { Kubectl, Resource } from '../src/kubectl-object-model';

import { getkubectlDownloadURL } from "../src/utilities/kubectl-util";
import { mocked } from 'ts-jest/utils';

var path = require('path');

const coreMock = mocked(core, true);
const ioMock = mocked(io, true);

const toolCacheMock = mocked(toolCache, true);
const fileUtility = mocked(fs, true);

const stableVersionUrl = 'https://storage.googleapis.com/kubernetes-release/release/stable.txt';

var deploymentYaml = "";

beforeAll(() => {
    deploymentYaml = fs.readFileSync(path.join(__dirname, 'manifests', 'deployment.yml'), 'utf8');
    process.env["KUBECONFIG"] = 'kubeConfig';
})

test("setKubectlPath() - install a particular version", async () => {
    const kubectlVersion = 'v1.18.0'
    //Mocks
    coreMock.getInput = jest.fn().mockReturnValue(kubectlVersion);
    toolCacheMock.find = jest.fn().mockReturnValue(undefined);
    toolCacheMock.downloadTool = jest.fn().mockReturnValue('downloadpath');
    toolCacheMock.cacheFile = jest.fn().mockReturnValue('cachepath');
    fileUtility.chmodSync = jest.fn();

    //Invoke and assert
    await expect(action.run()).resolves.not.toThrow();
    expect(toolCacheMock.find).toBeCalledWith('kubectl', kubectlVersion);
    expect(toolCacheMock.downloadTool).toBeCalledWith(getkubectlDownloadURL(kubectlVersion));
});

test("setKubectlPath() - install a latest version", async () => {
    const kubectlVersion = 'latest'
    //Mocks
    coreMock.getInput = jest.fn().mockReturnValue(kubectlVersion);
    jest.spyOn(fs, 'readFileSync').mockImplementation(() => "");
    toolCacheMock.find = jest.fn().mockReturnValue(undefined);
    toolCacheMock.downloadTool = jest.fn().mockResolvedValue('');
    toolCacheMock.cacheFile = jest.fn().mockReturnValue('cachepath');
    fileUtility.chmodSync = jest.fn();

    //Invoke and assert
    await expect(action.run()).resolves.not.toThrow();
    expect(toolCacheMock.find).toBeCalledWith('kubectl', kubectlVersion);
    expect(toolCacheMock.downloadTool).toBeCalledWith(stableVersionUrl);

});

test("setKubectlPath() - kubectl version already avilable", async () => {
    const kubectlVersion = 'v1.18.0'
    //Mock
    coreMock.getInput = jest.fn().mockReturnValue(kubectlVersion);
    toolCacheMock.find = jest.fn().mockReturnValue('validPath');
    toolCacheMock.downloadTool = jest.fn().mockReturnValue('downloadpath');
    toolCacheMock.cacheFile = jest.fn().mockReturnValue('cachepath');
    fileUtility.chmodSync = jest.fn();

    //Invoke and assert
    await expect(action.run()).resolves.not.toThrow();
    expect(toolCacheMock.find).toBeCalledWith('kubectl', kubectlVersion);
    expect(toolCacheMock.downloadTool).toBeCalledTimes(0);
});

test("setKubectlPath() - kubectl version not provided and kubectl avilable on machine", async () => {
    //Mock
    coreMock.getInput = jest.fn().mockReturnValue(undefined);
    ioMock.which = jest.fn().mockReturnValue('validPath');

    //Invoke and assert
    await expect(action.run()).resolves.not.toThrow();
    expect(ioMock.which).toBeCalledWith('kubectl', false);
    expect(toolCacheMock.downloadTool).toBeCalledTimes(0);
});

test("setKubectlPath() - kubectl version not provided and kubectl not avilable on machine", async () => {
    //Mock
    coreMock.getInput = jest.fn().mockReturnValue(undefined);
    ioMock.which = jest.fn().mockReturnValue(undefined);
    toolCacheMock.findAllVersions = jest.fn().mockReturnValue(undefined);

    //Invoke and assert
    await expect(action.run()).rejects.toThrowError();
    expect(ioMock.which).toBeCalledWith('kubectl', false);
});

test("run() - action not provided", async () => {
    const kubectlVersion = 'v1.18.0'
    coreMock.getInput = jest.fn().mockImplementation((name) => {
        if (name == 'action') {
            return undefined;
        }
        return kubectlVersion;
    });
    coreMock.setFailed = jest.fn();
    //Mocks
    toolCacheMock.find = jest.fn().mockReturnValue(undefined);
    toolCacheMock.downloadTool = jest.fn().mockReturnValue('downloadpath');
    toolCacheMock.cacheFile = jest.fn().mockReturnValue('cachepath');
    fileUtility.chmodSync = jest.fn();

    //Invoke and assert
    await expect(action.run()).resolves.not.toThrow();
    expect(coreMock.setFailed).toBeCalledWith('Not a valid action. The allowed actions are deploy, promote, reject');
});

test("run() - deploy - Manifiest not provided", async () => {
    //Mocks
    const kubectlVersion = 'v1.18.0'
    coreMock.getInput = jest.fn().mockImplementation((name) => {
        if (name == 'manifests') {
            return undefined;
        }
        if (name == 'action') {
            return 'deploy';
        }
        return kubectlVersion;
    });
    coreMock.setFailed = jest.fn();
    toolCacheMock.find = jest.fn().mockReturnValue(undefined);
    toolCacheMock.downloadTool = jest.fn().mockReturnValue('downloadpath');
    toolCacheMock.cacheFile = jest.fn().mockReturnValue('cachepath');
    fileUtility.chmodSync = jest.fn();

    //Invoke and assert
    await expect(action.run()).resolves.not.toThrow();
    expect(coreMock.setFailed).toBeCalledWith('No manifests supplied to deploy');
});

test("deployment - deploy() - Invokes with no manifestfiles", async () => {
    const kubeCtl: jest.Mocked<Kubectl> = new Kubectl("") as any;

    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, [], undefined)).rejects.toThrowError('ManifestFileNotFound');
});

test("run() - deploy", async () => {
    const kubectlVersion = 'v1.18.0'
    //Mocks
    coreMock.getInput = jest.fn().mockImplementation((name) => {
        if (name == 'manifests') {
            return 'manifests/deployment.yaml';
        }
        if (name == 'action') {
            return 'deploy';
        }
        if (name == 'strategy') {
            return undefined;
        }
        return kubectlVersion;
    });

    coreMock.setFailed = jest.fn();
    toolCacheMock.find = jest.fn().mockReturnValue('validPath');
    toolCacheMock.downloadTool = jest.fn().mockReturnValue('downloadpath');
    toolCacheMock.cacheFile = jest.fn().mockReturnValue('cachepath');
    fileUtility.chmodSync = jest.fn();
    const deploySpy = jest.spyOn(deployment, 'deploy').mockImplementation();

    //Invoke and assert
    await expect(action.run()).resolves.not.toThrow();
    expect(deploySpy).toBeCalledWith({ "ignoreSSLErrors": false, "kubectlPath": 'validPath', "namespace": "v1.18.0" }, ['manifests/deployment.yaml'], undefined);
    deploySpy.mockRestore();
});

test("deployment - deploy() - Invokes with manifestfiles", async () => {
    const KubernetesManifestUtilityMock = mocked(KubernetesManifestUtility, true);
    const KubernetesObjectUtilityMock = mocked(KubernetesObjectUtility, true);
    const kubeCtl: jest.Mocked<Kubectl> = new Kubectl("") as any;
    kubeCtl.apply = jest.fn().mockReturnValue("");
    const resources: Resource[] = [{ type: "Deployment", name: "AppName" }];
    KubernetesObjectUtilityMock.getResources = jest.fn().mockReturnValue(resources);
    kubeCtl.getResource = jest.fn().mockReturnValue("");
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");

    const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);

    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, ['manifests/deployment.yaml'], undefined)).resolves.not.toThrowError();
    expect(readFileSpy).toBeCalledWith("manifests/deployment.yaml");
    expect(kubeCtl.getResource).toBeCalledWith("ingress", "AppName");
});