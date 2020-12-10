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
const path = require("path");
const fs = require("fs");
const InputParameters = require("../input-parameters");
const trace_deployment_1 = require("./trace-deployment");
const core = require("@actions/core");
function getAksResourceContext() {
    const runnerTempDirectory = process.env['RUNNER_TEMP'];
    const aksResourceContextPath = path.join(runnerTempDirectory, `aks-resource-context.json`);
    try {
        console.log(`Reading file: ${aksResourceContextPath}`);
        const rawContent = fs.readFileSync(aksResourceContextPath, 'utf-8');
        return JSON.parse(rawContent);
    }
    catch (ex) {
        throw new Error(`An error occured while reading/parsing the contents of the file: ${aksResourceContextPath}. Error: ${ex}`);
    }
}
function getDeploymentPayload(aksResourceContext, deploymentName) {
    const targetResourceId = `/subscriptions/${aksResourceContext.subscriptionId}/resourceGroups/${aksResourceContext.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${aksResourceContext.clusterName}`;
    return {
        "location": "westus",
        "properties": {
            "targetResource": {
                "id": targetResourceId,
                "type": "Microsoft.ContainerService/managedClusters",
                "dataProperties": {
                    "namespaces": [
                        InputParameters.namespace
                    ]
                }
            },
            "deployer": {
                "type": "Automated",
                "properties": {
                    "provider": "GitHub",
                    "repository": process.env['GITHUB_REPOSITORY'],
                    "workflowId": "stub",
                    "workflowRunId": process.env['GITHUB_RUN_ID'],
                    "workflowRunproperties": {
                        "commitsDelta": [],
                        "issuesDelta": []
                    }
                }
            },
            "resourceChanges": {
                "type": "Data",
                "armDeploymentId": "",
                "armPropertyChanges": "",
                "dataPropertyChanges": {
                    "namespace": InputParameters.namespace,
                    "dockerFile": "",
                    "manifests": {
                        "deployment": deploymentName,
                        "service": "stubservice"
                    }
                }
            },
            "status": "Succeeded",
            "startedAt": "2020-11-17T04:06:52.858948",
            "finishedAt": "2020-11-17T04:07:52.858948"
        }
    };
}
function createDeploymentResource(aksResourceContext, deploymentPayload) {
    return __awaiter(this, void 0, void 0, function* () {
        return Promise.resolve();
        // const deploymentName = `${aksResourceContext.clusterName}-${InputParameters.namespace}-deployment-${process.env['GITHUB_SHA']}`;
        // return new Promise<string>((resolve, reject) => {
        //   var webRequest = new WebRequest();
        //   webRequest.method = 'PUT';
        //   webRequest.uri = `${aksResourceContext.managementUrl}subscriptions/${aksResourceContext.subscriptionId}/resourceGroups/${aksResourceContext.resourceGroup}/providers/Microsoft.DeploymentCenterV2/deploymentsv2/${deploymentName}?api-version=2020-06-01-preview`;
        //   console.log(`Deployment resource URI: ${webRequest.uri}`);
        //   webRequest.headers = {
        //     'Authorization': 'Bearer ' + aksResourceContext.sessionToken,
        //     'Content-Type': 'application/json; charset=utf-8'
        //   }
        //   webRequest.body = JSON.stringify(deploymentPayload);
        //   sendRequest(webRequest).then((response: WebResponse) => {
        //     if (response.statusCode == StatusCodes.OK
        //       || response.statusCode == StatusCodes.CREATED
        //       || response.statusCode == StatusCodes.ACCEPTED) {
        //       resolve(response.body);
        //     } else {
        //       console.log(`An error occured while creating the deployment resource. Response body: '${JSON.stringify(response.body)}'`);
        //       reject(JSON.stringify(response.body));
        //     }
        //   }).catch(reject);
        // });
    });
}
function addTraceability(deploymentName) {
    return __awaiter(this, void 0, void 0, function* () {
        const aksResourceContext = getAksResourceContext();
        let deploymentPayload = getDeploymentPayload(aksResourceContext, deploymentName);
        createDeploymentReport(aksResourceContext, deploymentName);
        console.log(`[New] Trying to create the deployment resource with payload: \n${JSON.stringify(deploymentPayload)}`);
        try {
            const deploymentResource = yield createDeploymentResource(aksResourceContext, deploymentPayload);
            console.log(`Deployment resource created successfully. Deployment resource object: \n${JSON.stringify(deploymentResource)}`);
        }
        catch (error) {
            console.log(`Some error occured: ${error}`);
        }
    });
}
exports.addTraceability = addTraceability;
function createDeploymentReport(context, deploymentManifests) {
    let resource = {
        id: `/subscriptions/${context.subscriptionId}/resourceGroups/${context.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${context.clusterName}`,
        provider: 'Azure',
        type: 'Microsoft.ContainerService/managedClusters',
        properties: {
            manifests: deploymentManifests
        }
    };
    let deploymentReport = {
        targetResource: resource,
        pipeline: {
            provider: "GitHub",
            properties: trace_deployment_1.getGitHubPipelineProperties("succeeded")
        },
        artifacts: []
    };
    const deploymentReportPath = path.join(process.env['RUNNER_TEMP'], 'deployment-report.json');
    fs.writeFileSync(deploymentReportPath, JSON.stringify(deploymentReport));
    core.setOutput('deployment-report', deploymentReportPath);
}
