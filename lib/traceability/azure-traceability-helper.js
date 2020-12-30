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
        return null;
    }
}
function createDeploymentResource(aksResourceContext, deploymentReport) {
    return __awaiter(this, void 0, void 0, function* () {
        const deploymentName = `${aksResourceContext.clusterName}-${InputParameters.namespace}-deployment-${process.env['GITHUB_SHA']}`;
        const deploymentPayload = {
            properties: {
                resourcePayload: deploymentReport
            }
        };
        console.log(`Deployment resource payload: ${deploymentPayload}`);
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
function addTraceability(deployedManifestFiles) {
    return __awaiter(this, void 0, void 0, function* () {
        const aksResourceContext = getAksResourceContext();
        if (aksResourceContext !== null) {
            const deploymentReport = getDeploymentReport(aksResourceContext, deployedManifestFiles);
            try {
                console.log(`Trying to create the deployment resource with payload: \n${JSON.stringify(deploymentReport)}`);
                const deploymentResource = yield createDeploymentResource(aksResourceContext, deploymentReport);
                console.log(`Deployment resource created successfully. Deployment resource object: \n${JSON.stringify(deploymentResource)}`);
            }
            catch (error) {
                console.log(`Some error occured: ${error}`);
                return Promise.reject(error);
            }
        }
        return Promise.resolve();
    });
}
exports.addTraceability = addTraceability;
function getDeploymentReport(context, deployedManifestFiles) {
    let kubernetesObjects = [];
    if (deployedManifestFiles && deployedManifestFiles.length > 0) {
        deployedManifestFiles.forEach((manifest) => {
            let manifestContent = JSON.parse(fs.readFileSync(manifest, { encoding: "utf-8" }));
            if (manifestContent &&
                manifestContent.kind &&
                manifestContent.metadata &&
                manifestContent.metadata.name) {
                kubernetesObjects.push({
                    kind: manifestContent.kind,
                    name: manifestContent.metadata.name
                });
            }
        });
    }
    const resource = {
        id: `/subscriptions/${context.subscriptionId}/resourceGroups/${context.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${context.clusterName}`,
        provider: 'Azure',
        type: 'Microsoft.ContainerService/managedClusters',
        properties: {
            namespace: InputParameters.namespace,
            kubernetesObjects: kubernetesObjects
        }
    };
    const artifact = {
        type: 'container',
        properties: {
            "images": InputParameters.containers.map(image => {
                return {
                    "image": image,
                    "dockerfile": ""
                };
            }),
            "helmchart": [],
            "manifests": InputParameters.manifests
        }
    };
    const deploymentReport = new azure_actions_traceability_1.DeploymentReport([artifact], 'succeeded', resource);
    const deploymentReportPath = deploymentReport.export();
    core.setOutput('deployment-report', deploymentReportPath);
    return JSON.parse(fs.readFileSync(deploymentReportPath, { encoding: "utf-8" }));
}
