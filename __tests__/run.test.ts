import * as KubernetesManifestUtility from '../src/utilities/manifest-stability-utility';
import * as KubernetesObjectUtility from '../src/utilities/resource-object-utility';
import * as action from '../src/run';
import * as core from '@actions/core';
import * as deployment from '../src/utilities/strategy-helpers/deployment-helper';
import * as fs from 'fs';
import * as io from '@actions/io';
import * as toolCache from '@actions/tool-cache';
import * as fileHelper from '../src/utilities/files-helper';
import { workflowAnnotations } from '../src/constants';
import * as inputParam from '../src/input-parameters';

import { Kubectl, Resource } from '../src/kubectl-object-model';

import { getkubectlDownloadURL } from "../src/utilities/kubectl-util";
import { mocked } from 'ts-jest/utils';

var path = require('path');
const os = require("os");

const coreMock = mocked(core, true);
const ioMock = mocked(io, true);
const inputParamMock = mocked(inputParam, true);

const toolCacheMock = mocked(toolCache, true);
const fileUtility = mocked(fs, true);

const stableVersionUrl = 'https://storage.googleapis.com/kubernetes-release/release/stable.txt';

var deploymentYaml = "";

const getAllPodsMock = {
    'code': 0,
    'stdout': '{"apiVersion": "v1","items": [{"apiVersion": "v1","kind": "Pod","metadata": {"labels": {"app": "testapp","pod-template-hash": "776cbc86f9"},"name": "testpod-776cbc86f9-pjrb6","namespace": "testnamespace","ownerReferences": [{"apiVersion": "apps/v1","blockOwnerDeletion": true,"controller": true,"kind": "ReplicaSet","name": "testpod-776cbc86f9","uid": "de544628-6589-4354-81fe-05faf00d336a"}],"resourceVersion": "12362496","selfLink": "/api/v1/namespaces/akskodey8187/pods/akskodey-776cbc86f9-pjrb6","uid": "c7d5f4c1-11a1-4884-8a66-09b015c72f69"},"spec": {"containers": [{"image": "imageId","imagePullPolicy": "IfNotPresent","name": "containerName","ports": [{"containerPort": 80,"protocol": "TCP"}]}]},"status": {"hostIP": "10.240.0.4","phase": "Running","podIP": "10.244.0.25","qosClass": "BestEffort","startTime": "2020-06-04T07:59:42Z"}}]}'
};

const getNamespaceMock = {
    'code': 0,
    'stdout': '{"apiVersion": "v1","kind": "Namespace","metadata": {"annotations": {"workflow": ".github/workflows/workflow.yml","runUri": "https://github.com/testRepo/actions/runs/12345"}},"spec": {"finalizers": ["kubernetes"]},"status": {"phase": "Active"}}'
};

const resources: Resource[] = [{ type: "Deployment", name: "AppName" }];

beforeEach(() => {
    deploymentYaml = fs.readFileSync(path.join(__dirname, 'manifests', 'deployment.yml'), 'utf8');

    process.env["KUBECONFIG"] = 'kubeConfig';
    process.env['GITHUB_RUN_ID'] = '12345';
    process.env['GITHUB_WORKFLOW'] = '.github/workflows/workflow.yml';
    process.env['GITHUB_JOB'] = 'build-and-deploy';
    process.env['GITHUB_ACTOR'] = 'testUser';
    process.env['GITHUB_REPOSITORY'] = 'testRepo';
    process.env['GITHUB_SHA'] = 'testCommit';
    process.env['GITHUB_REF'] = 'testBranch';
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

test("run() - deploy - Manifests provided by new line delimiter", async () => {
    const kubectlVersion = 'v1.18.0'
    coreMock.getInput = jest.fn().mockImplementation((name) => {
        if (name == 'manifests') {
            return "bg-smi.yml\nbg.yml\ndeployment.yml";
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
});

test("run() - deploy - Manifests provided by comma as a delimiter", async () => {
    const kubectlVersion = 'v1.18.0'
    coreMock.getInput = jest.fn().mockImplementation((name) => {
        if (name == 'manifests') {
            return "bg-smi.yml,bg.yml,deployment.yml";
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
});

test("run() - deploy - Manifests provided by both new line and comma as a delimiter", async () => {
    const kubectlVersion = 'v1.18.0'
    coreMock.getInput = jest.fn().mockImplementation((name) => {
        if (name == 'manifests') {
            return "bg-smi.yml\nbg.yml,deployment.yml";
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
    KubernetesObjectUtilityMock.getResources = jest.fn().mockReturnValue(resources);
    kubeCtl.getResource = jest.fn().mockReturnValue(getNamespaceMock);
    kubeCtl.getAllPods = jest.fn().mockReturnValue(getAllPodsMock);
    kubeCtl.describe = jest.fn().mockReturnValue("");
    kubeCtl.annotateFiles = jest.fn().mockReturnValue("");
    kubeCtl.annotate = jest.fn().mockReturnValue("");
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");

    const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);

    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, ['manifests/deployment.yaml'], undefined)).resolves.not.toThrowError();
    expect(readFileSpy).toBeCalledWith("manifests/deployment.yaml");
    expect(kubeCtl.getResource).toBeCalledWith("ingress", "AppName");
});

test("deployment - deploy() - deploy force flag on", async () => {
    //Mocks
    inputParamMock.forceDeployment = true;
    const applyResMock = {
        'code': 0,
        'stderr': '',
        'error': Error(""),
        'stdout': 'changes configured'
    };
    const KubernetesManifestUtilityMock = mocked(KubernetesManifestUtility, true);
    const KubernetesObjectUtilityMock = mocked(KubernetesObjectUtility, true);
    const kubeCtl: jest.Mocked<Kubectl> = new Kubectl("") as any;
    KubernetesObjectUtilityMock.getResources = jest.fn().mockReturnValue(resources);
    kubeCtl.getResource = jest.fn().mockReturnValue(getNamespaceMock);
    kubeCtl.getAllPods = jest.fn().mockReturnValue(getAllPodsMock);
    kubeCtl.describe = jest.fn().mockReturnValue("");
    kubeCtl.annotateFiles = jest.fn().mockReturnValue("");
    kubeCtl.annotate = jest.fn().mockReturnValue("");
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");

    const deploySpy = jest.spyOn(kubeCtl, 'apply').mockImplementation(() => applyResMock);

    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, ['manifests/deployment.yaml'], undefined)).resolves.not.toThrowError();
    expect(deploySpy).toBeCalledWith(expect.anything(), true);
    deploySpy.mockRestore();
});

test("deployment - deploy() - Annotate resources", async () => {
    const KubernetesManifestUtilityMock = mocked(KubernetesManifestUtility, true);
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");
    const KubernetesObjectUtilityMock = mocked(KubernetesObjectUtility, true);
    KubernetesObjectUtilityMock.getResources = jest.fn().mockReturnValue(resources);
    const fileHelperMock = mocked(fileHelper, true);
    fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue(["~/Deployment_testapp_currentTimestamp"]);
    const kubeCtl: jest.Mocked<Kubectl> = new Kubectl("") as any;
    kubeCtl.apply = jest.fn().mockReturnValue("");
    kubeCtl.getResource = jest.fn().mockReturnValue(getNamespaceMock);
    kubeCtl.getAllPods = jest.fn().mockReturnValue(getAllPodsMock);
    kubeCtl.getNewReplicaSet = jest.fn().mockReturnValue("testpod-776cbc86f9");
    kubeCtl.annotateFiles = jest.fn().mockReturnValue("");
    kubeCtl.annotate = jest.fn().mockReturnValue("");

    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, ['manifests/deployment.yaml'], undefined)).resolves.not.toThrowError();
    expect(kubeCtl.annotateFiles).toBeCalledWith(["~/Deployment_testapp_currentTimestamp"], workflowAnnotations, true);
    expect(kubeCtl.annotate).toBeCalledTimes(2);
});

test("deployment - deploy() - Skip Annotate namespace", async () => {
    process.env['GITHUB_REPOSITORY'] = 'test1Repo';
    const KubernetesManifestUtilityMock = mocked(KubernetesManifestUtility, true);
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");
    const KubernetesObjectUtilityMock = mocked(KubernetesObjectUtility, true);
    KubernetesObjectUtilityMock.getResources = jest.fn().mockReturnValue(resources);
    const fileHelperMock = mocked(fileHelper, true);
    fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue(["~/Deployment_testapp_currentTimestamp"]);
    const kubeCtl: jest.Mocked<Kubectl> = new Kubectl("") as any;
    kubeCtl.apply = jest.fn().mockReturnValue("");
    kubeCtl.getResource = jest.fn().mockReturnValue(getNamespaceMock);
    kubeCtl.getAllPods = jest.fn().mockReturnValue(getAllPodsMock);
    kubeCtl.getNewReplicaSet = jest.fn().mockReturnValue("testpod-776cbc86f9");
    kubeCtl.annotateFiles = jest.fn().mockReturnValue("");
    kubeCtl.annotate = jest.fn().mockReturnValue("");

    const consoleOutputSpy = jest.spyOn(process.stdout, "write").mockImplementation();

    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, ['manifests/deployment.yaml'], undefined)).resolves.not.toThrowError();
    expect(kubeCtl.annotateFiles).toBeCalledWith(["~/Deployment_testapp_currentTimestamp"], workflowAnnotations, true);
    expect(kubeCtl.annotate).toBeCalledTimes(1);
    expect(consoleOutputSpy).toHaveBeenNthCalledWith(2, `::debug::Skipping 'annotate namespace' as namespace annotated by other workflow` + os.EOL)
});

test("deployment - deploy() - Annotate resources failed", async () => {
    //Mocks
    inputParamMock.forceDeployment = true;
    const annotateMock = {
        'code': 1,
        'stderr': 'kubectl annotate failed',
        'error': Error(""),
        'stdout': ''
    };
    const KubernetesManifestUtilityMock = mocked(KubernetesManifestUtility, true);
    const KubernetesObjectUtilityMock = mocked(KubernetesObjectUtility, true);
    const kubeCtl: jest.Mocked<Kubectl> = new Kubectl("") as any;
    KubernetesObjectUtilityMock.getResources = jest.fn().mockReturnValue(resources);
    kubeCtl.apply = jest.fn().mockReturnValue("");
    kubeCtl.getResource = jest.fn().mockReturnValue(getNamespaceMock);
    kubeCtl.getAllPods = jest.fn().mockReturnValue(getAllPodsMock);
    kubeCtl.describe = jest.fn().mockReturnValue("");
    kubeCtl.annotateFiles = jest.fn().mockReturnValue("");
    kubeCtl.annotate = jest.fn().mockReturnValue(annotateMock);
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");

    const consoleOutputSpy = jest.spyOn(process.stdout, "write").mockImplementation();
    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, ['manifests/deployment.yaml'], undefined)).resolves.not.toThrowError();
    expect(consoleOutputSpy).toHaveBeenNthCalledWith(2, '::warning::kubectl annotate failed' + os.EOL)
});