import * as KubernetesManifestUtility from '../src/utilities/manifest-stability-utility';
import * as KubernetesObjectUtility from '../src/utilities/resource-object-utility';
import * as action from '../src/run';
import * as core from '@actions/core';
import * as deployment from '../src/utilities/strategy-helpers/deployment-helper';
import * as fs from 'fs';
import * as io from '@actions/io';
import * as toolCache from '@actions/tool-cache';
import * as fileHelper from '../src/utilities/files-helper';
import { getWorkflowAnnotationKeyLabel, getWorkflowAnnotationsJson } from '../src/constants';
import * as inputParam from '../src/input-parameters';

import { Kubectl, Resource } from '../src/kubectl-object-model';
import *  as httpClient from '../src/utilities/httpClient';
import * as utility from '../src/utilities/utility';

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
    'stdout': '{"apiVersion": "v1","kind": "Namespace","metadata": {"annotations": {"githubWorkflow_c11401b9d232942bac19cbc5bc32b42d": "{\'run\': \'202489005\',\'repository\': \'testUser/hello-kubernetes\',\'workflow\': \'workflow1\',\'jobName\': \'build-and-deploy\',\'createdBy\': \'testUser\',\'runUri\': \'https://github.com/testUser/hello-kubernetes/actions/runs/202489005\',\'commit\': \'currentCommit\',\'lastSuccessRunCommit\': \'lastCommit\',\'branch\': \'refs/heads/branch-rename\',\'deployTimestamp\': \'1597062957973\',\'dockerfilePaths\': \'{}\',\'manifestsPaths\': \'[]\',\'helmChartPaths\': \'[]\',\'provider\': \'GitHub\'}","githubWorkflow_21fd7a597282ca5adc05ba99018b3706": "{\'run\': \'202504411\',\'repository\': \'testUser/hello-kubernetes\',\'workflow\': \'workflowMaster\',\'jobName\': \'build-and-deploy\',\'createdBy\': \'testUser\',\'runUri\': \'https://github.com/testUser/hello-kubernetes/actions/runs/202504411\',\'commit\': \'currentCommit1\',\'lastSuccessRunCommit\': \'NA\',\'branch\': \'refs/heads/master\',\'deployTimestamp\': \'1597063919873\',\'filePathConfigs\': \'{}\',\'provider\': \'GitHub\'}"}},"spec": {"finalizers": ["kubernetes"]},"status": {"phase": "Active"}}'
};

const getWorkflowsUrlResponse = {
    'statusCode': httpClient.StatusCodes.OK,
    'body': {
        "total_count": 2,
        "workflows": [
            {
                "id": 1477727,
                "node_id": "MDg6V29ya2Zsb3cxNDYwNzI3",
                "name": ".github/workflows/workflow.yml",
                "path": ".github/workflows/workflow.yml",
                "state": "active",
                "created_at": "2020-06-03T23:41:06.000+05:30",
                "updated_at": "2020-08-07T15:46:42.000+05:30",
                "url": "https://api.github.com/repos/testUser/hello-kubernetes/actions/workflows/1460727",
                "html_url": "https://github.com/testUser/hello-kubernetes/blob/master/.github/workflows/workflow.yml",
                "badge_url": "https://github.com/testUser/hello-kubernetes/workflows/.github/workflows/workflow.yml/badge.svg"
            },
            {
                "id": 1532230,
                "node_id": "MDg6V29ya2Zsb3cxNTMyMzMw",
                "name": "NewWorkflow",
                "path": ".github/workflows/workflow1.yml",
                "state": "active",
                "created_at": "2020-06-11T16:05:23.000+05:30",
                "updated_at": "2020-08-07T15:46:42.000+05:30",
                "url": "https://api.github.com/repos/testUser/hello-kubernetes/actions/workflows/1532330",
                "html_url": "https://github.com/testUser/hello-kubernetes/blob/master/.github/workflows/workflowNew.yml",
                "badge_url": "https://github.com/testUser/hello-kubernetes/workflows/KoDeyi/badge.svg"
            }
        ]
    }
} as httpClient.WebResponse;

const resources: Resource[] = [{ type: "Deployment", name: "AppName" }];

beforeEach(() => {
    deploymentYaml = fs.readFileSync(path.join(__dirname, 'manifests', 'deployment.yml'), 'utf8');
    jest.spyOn(Date, 'now').mockImplementation(() => 1234561234567);

    process.env["KUBECONFIG"] = 'kubeConfig';
    process.env['GITHUB_RUN_ID'] = '12345';
    process.env['GITHUB_WORKFLOW'] = '.github/workflows/workflow.yml';
    process.env['GITHUB_JOB'] = 'build-and-deploy';
    process.env['GITHUB_ACTOR'] = 'testUser';
    process.env['GITHUB_REPOSITORY'] = 'testRepo';
    process.env['GITHUB_SHA'] = 'testCommit';
    process.env['GITHUB_REF'] = 'testBranch';
    process.env['GITHUB_TOKEN'] = 'testToken';
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
    KubernetesObjectUtilityMock.getResources = jest.fn().mockReturnValue(resources);
    kubeCtl.getResource = jest.fn().mockReturnValue(getNamespaceMock);
    kubeCtl.getAllPods = jest.fn().mockReturnValue(getAllPodsMock);
    kubeCtl.describe = jest.fn().mockReturnValue("");
    kubeCtl.annotateFiles = jest.fn().mockReturnValue("");
    kubeCtl.annotate = jest.fn().mockReturnValue("");
    kubeCtl.labelFiles = jest.fn().mockReturnValue("");
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");

    const readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => deploymentYaml);
    jest.spyOn(httpClient, 'sendRequest').mockImplementation(() => Promise.resolve(getWorkflowsUrlResponse));

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
    kubeCtl.labelFiles = jest.fn().mockReturnValue("");
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");

    const deploySpy = jest.spyOn(kubeCtl, 'apply').mockImplementation(() => applyResMock);
    jest.spyOn(httpClient, 'sendRequest').mockImplementation(() => Promise.resolve(getWorkflowsUrlResponse));

    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, ['manifests/deployment.yaml'], undefined)).resolves.not.toThrowError();
    expect(deploySpy).toBeCalledWith(expect.anything(), true);
    deploySpy.mockRestore();
});

test("deployment - deploy() - Annotate & label resources", async () => {
    let filepathConfigs = { manifestFilePaths :['manifests/deployment.yaml'], helmChartFilePaths : '', buildConfigs :{}} ;
    let annotationKeyValStr = getWorkflowAnnotationKeyLabel(process.env.GITHUB_WORKFLOW) + '=' + getWorkflowAnnotationsJson('currentCommit', '.github/workflows/workflow.yml', filepathConfigs);
    const KubernetesManifestUtilityMock = mocked(KubernetesManifestUtility, true);
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");
    const KubernetesObjectUtilityMock = mocked(KubernetesObjectUtility, true);
    KubernetesObjectUtilityMock.getResources = jest.fn().mockReturnValue(resources);
    const fileHelperMock = mocked(fileHelper, true);
    fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue(["~/Deployment_testapp_currentTimestamp"]);
    jest.spyOn(utility, 'getWorkflowFilePath').mockImplementation(() => Promise.resolve(process.env.GITHUB_WORKFLOW));
    jest.spyOn(utility, 'getFilePathsConfigs').mockImplementation(()=> Promise.resolve(filepathConfigs));

    const kubeCtl: jest.Mocked<Kubectl> = new Kubectl("") as any;
    kubeCtl.apply = jest.fn().mockReturnValue("");
    kubeCtl.getResource = jest.fn().mockReturnValue(getNamespaceMock);
    kubeCtl.getAllPods = jest.fn().mockReturnValue(getAllPodsMock);
    kubeCtl.getNewReplicaSet = jest.fn().mockReturnValue("testpod-776cbc86f9");
    kubeCtl.annotateFiles = jest.fn().mockReturnValue("");
    kubeCtl.annotate = jest.fn().mockReturnValue("");
    kubeCtl.labelFiles = jest.fn();
    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, ['manifests/deployment.yaml'], undefined)).resolves.not.toThrowError();
    expect(kubeCtl.annotate).toHaveBeenNthCalledWith(1, 'namespace', 'default', annotationKeyValStr);
    expect(kubeCtl.annotateFiles).toBeCalledWith(["~/Deployment_testapp_currentTimestamp"], annotationKeyValStr);
    expect(kubeCtl.annotate).toBeCalledTimes(2);
    expect(kubeCtl.labelFiles).toBeCalledWith(["~/Deployment_testapp_currentTimestamp"],
        [`workflowFriendlyName=workflow.yml`, `workflow=${getWorkflowAnnotationKeyLabel(process.env.GITHUB_WORKFLOW)}`]);
});

test("deployment - deploy() - Annotate & label resources for a new workflow", async () => {
    process.env.GITHUB_WORKFLOW = '.github/workflows/NewWorkflow.yml';
    let filepathConfigs = { manifestFilePaths :['manifests/deployment.yaml'], helmChartFilePaths : '', buildConfigs :{}} ;
    let annotationKeyValStr = getWorkflowAnnotationKeyLabel(process.env.GITHUB_WORKFLOW) + '=' + getWorkflowAnnotationsJson('NA', '.github/workflows/NewWorkflow.yml', filepathConfigs);
    const KubernetesManifestUtilityMock = mocked(KubernetesManifestUtility, true);
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");
    const KubernetesObjectUtilityMock = mocked(KubernetesObjectUtility, true);
    KubernetesObjectUtilityMock.getResources = jest.fn().mockReturnValue(resources);
    const fileHelperMock = mocked(fileHelper, true);
    fileHelperMock.writeObjectsToFile = jest.fn().mockReturnValue(["~/Deployment_testapp_currentTimestamp"]);
    jest.spyOn(httpClient, 'sendRequest').mockImplementation(() => Promise.resolve(getWorkflowsUrlResponse));

    const kubeCtl: jest.Mocked<Kubectl> = new Kubectl("") as any;
    kubeCtl.apply = jest.fn().mockReturnValue("");
    kubeCtl.getResource = jest.fn().mockReturnValue(getNamespaceMock);
    kubeCtl.getAllPods = jest.fn().mockReturnValue(getAllPodsMock);
    kubeCtl.getNewReplicaSet = jest.fn().mockReturnValue("testpod-776cbc86f9");
    kubeCtl.annotateFiles = jest.fn().mockReturnValue("");
    kubeCtl.annotate = jest.fn().mockReturnValue("");
    kubeCtl.labelFiles = jest.fn();
    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, ['manifests/deployment.yaml'], undefined)).resolves.not.toThrowError();
    expect(kubeCtl.annotate).toHaveBeenNthCalledWith(1, 'namespace', 'default', annotationKeyValStr);
    expect(kubeCtl.annotateFiles).toBeCalledWith(["~/Deployment_testapp_currentTimestamp"], annotationKeyValStr);
    expect(kubeCtl.annotate).toBeCalledTimes(2);
    expect(kubeCtl.labelFiles).toBeCalledWith(["~/Deployment_testapp_currentTimestamp"],
        [`workflowFriendlyName=NewWorkflow.yml`, `workflow=${getWorkflowAnnotationKeyLabel(process.env.GITHUB_WORKFLOW)}`]);
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
    kubeCtl.labelFiles = jest.fn().mockReturnValue("");
    KubernetesManifestUtilityMock.checkManifestStability = jest.fn().mockReturnValue("");

    const consoleOutputSpy = jest.spyOn(process.stdout, "write").mockImplementation();
    //Invoke and assert
    await expect(deployment.deploy(kubeCtl, ['manifests/deployment.yaml'], undefined)).resolves.not.toThrowError();
    expect(consoleOutputSpy).toHaveBeenNthCalledWith(2, '::warning::kubectl annotate failed' + os.EOL)
});

test("utility - getWorkflowFilePath() - Get workflow file path under API failure", async () => {
    //Mocks
    const errorWebResponse = {
        'statusCode': httpClient.StatusCodes.UNAUTHORIZED,
        'body': {}
    } as httpClient.WebResponse
    jest.spyOn(httpClient, 'sendRequest').mockImplementation(() => Promise.resolve(errorWebResponse));

    //Invoke and assert
    await expect(utility.getWorkflowFilePath(process.env.GITHUB_TOKEN)).resolves.not.toThrowError;
    await expect(utility.getWorkflowFilePath(process.env.GITHUB_TOKEN)).resolves.toBe(process.env.GITHUB_WORKFLOW);
});