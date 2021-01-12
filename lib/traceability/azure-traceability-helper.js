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
exports.addTraceability = void 0;
const path = require("path");
const fs = require("fs");
const azure_actions_traceability_1 = require("@azure/azure-actions-traceability");
const httpClient_1 = require("../utilities/httpClient");
const InputParameters = require("../input-parameters");
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
        core.debug(`An error occured while reading/parsing the contents of the file: ${aksResourceContextPath}. Error: ${ex}`);
        return null;
    }
}
function getDeploymentPayload(deploymentReport) {
    return {
        "properties": {
            "targetResource": {
                "id": deploymentReport.targetResource.id,
                "type": deploymentReport.targetResource.type,
                "properties": {
                    "namespace": deploymentReport.targetResource.properties['namespace'],
                    "kubernetesObjects": deploymentReport.targetResource.properties['kubernetesObjects']
                }
            },
            "workflowRun": deploymentReport.pipeline,
            "artifacts": [
                {
                    "type": "container",
                    "properties": {
                        "image": deploymentReport.artifacts[0]["properties"]["images"][0]["image"],
                        "manifests": deploymentReport.artifacts[0]["properties"]["manifests"]
                    }
                }
            ]
        }
    };
}
function createDeploymentResource(aksResourceContext, deploymentPayload) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            var webRequest = new httpClient_1.WebRequest();
            webRequest.method = 'PUT';
            webRequest.uri = getResourceUri(aksResourceContext);
            console.log(`Deployment resource URI: ${webRequest.uri}`);
            webRequest.headers = {
                'Authorization': 'Bearer ' + aksResourceContext.sessionToken,
                'Content-Type': 'application/json; charset=utf-8'
            };
            webRequest.body = JSON.stringify(deploymentPayload);
            httpClient_1.sendRequest(webRequest).then((response) => {
                if (response.statusCode == httpClient_1.StatusCodes.OK
                    || response.statusCode == httpClient_1.StatusCodes.CREATED
                    || response.statusCode == httpClient_1.StatusCodes.ACCEPTED) {
                    resolve(response.body);
                }
                else {
                    console.log(`An error occured while creating the deployment resource. Response body: '${JSON.stringify(response.body)}'`);
                    reject(JSON.stringify(response.body));
                }
            }).catch(reject);
        });
    });
}
function addTraceability(kubectl, deploymentConfig) {
    return __awaiter(this, void 0, void 0, function* () {
        const aksResourceContext = getAksResourceContext();
        if (aksResourceContext !== null) {
            const deploymentReport = yield getDeploymentReport(aksResourceContext, kubectl, deploymentConfig);
            const deploymentPayload = getDeploymentPayload(deploymentReport);
            try {
                console.log(`Trying to create the deployment resource with payload: \n${JSON.stringify(deploymentPayload)}`);
                const deploymentResource = yield createDeploymentResource(aksResourceContext, deploymentPayload);
                console.log(`Deployment resource created successfully. Deployment resource object: \n${JSON.stringify(deploymentResource)}`);
            }
            catch (error) {
                core.warning(`Some error occured while creating the deployment resource for traceability: ${error}`);
            }
        }
        return Promise.resolve();
    });
}
exports.addTraceability = addTraceability;
function getResourceUri(aksResourceContext) {
    const deploymentName = `${aksResourceContext.clusterName}-${InputParameters.namespace}-deployment-${process.env['GITHUB_SHA']}`;
    return `${aksResourceContext.managementUrl}subscriptions/${aksResourceContext.subscriptionId}/resourceGroups/${aksResourceContext.resourceGroup}/providers/Microsoft.Devops/deploymentv2/${deploymentName}?api-version=2020-10-01-preview`;
}
function getDeploymentReport(context, kubectl, deploymentConfig) {
    return __awaiter(this, void 0, void 0, function* () {
        const resource = {
            id: `/subscriptions/${context.subscriptionId}/resourceGroups/${context.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${context.clusterName}`,
            provider: 'Azure',
            type: 'Microsoft.ContainerService/managedClusters',
            properties: {
                namespace: InputParameters.namespace,
                kubernetesObjects: kubectl.getDeployedObjects()
            }
        };
        const artifact = {
            type: 'container',
            properties: {
                "images": InputParameters.containers.map(image => {
                    return {
                        "image": image,
                        "dockerfile": deploymentConfig.dockerfilePaths[image] || ""
                    };
                }),
                "helmchart": deploymentConfig.helmChartFilePaths,
                "manifests": deploymentConfig.manifestFilePaths
            }
        };
        const deploymentReport = new azure_actions_traceability_1.DeploymentReport([artifact], 'succeeded', resource);
        const deploymentReportPath = deploymentReport.export();
        core.setOutput('deployment-report', deploymentReportPath);
        return Promise.resolve(deploymentReport);
    });
}
