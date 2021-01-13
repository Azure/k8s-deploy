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
const utility_1 = require("../utilities/utility");
const kubeconfig_utility_1 = require("../utilities/kubeconfig-utility");
const AKS_RESOURCE_TYPE = 'Microsoft.ContainerService/ManagedClusters';
function getAksResourceContext() {
    const runnerTempDirectory = process.env['RUNNER_TEMP'];
    const aksResourceContextPath = path.join(runnerTempDirectory, `aks-resource-context.json`);
    try {
        core.debug(`Trying to obtain AKS resource context from file: '${aksResourceContextPath}'`);
        const rawContent = fs.readFileSync(aksResourceContextPath, 'utf-8');
        return JSON.parse(rawContent);
    }
    catch (ex) {
        core.debug(`An error occured while reading/parsing the contents of the file: ${aksResourceContextPath}. Error: ${ex}`);
        return null;
    }
}
function getDeploymentPayload(deploymentReport, aksResourceContext) {
    return {
        "properties": {
            "targetResource": {
                "id": getAksResourceId(aksResourceContext),
                "type": AKS_RESOURCE_TYPE,
                "properties": deploymentReport.targetResource.properties
            },
            "workflowRun": deploymentReport.workflowRun,
            "artifacts": deploymentReport.artifacts
        }
    };
}
function createDeploymentResource(aksResourceContext, deploymentPayload) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            var webRequest = new httpClient_1.WebRequest();
            webRequest.method = 'PUT';
            webRequest.uri = getDeploymentResourceUri(aksResourceContext);
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
// Should not throw as it is executed in the finally block of run
function addTraceability(kubectl, deploymentConfig, runStatus) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const deploymentReport = yield createDeploymentReport(kubectl, deploymentConfig, runStatus);
            const aksResourceContext = getAksResourceContext();
            if (aksResourceContext !== null) {
                const deploymentPayload = getDeploymentPayload(deploymentReport, aksResourceContext);
                core.debug(`Trying to create the deployment resource with payload: \n${JSON.stringify(deploymentPayload)}`);
                const deploymentResource = yield createDeploymentResource(aksResourceContext, deploymentPayload);
                core.debug(`Deployment resource created successfully. Deployment resource object: \n${JSON.stringify(deploymentResource)}`);
            }
        }
        catch (error) {
            core.warning(`Some error occured while adding traceability information: ${error}`);
        }
        return Promise.resolve();
    });
}
exports.addTraceability = addTraceability;
function getAksResourceId(aksResourceContext) {
    return `/subscriptions/${aksResourceContext.subscriptionId}/resourceGroups/${aksResourceContext.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${aksResourceContext.clusterName}`;
}
function getDeploymentResourceUri(aksResourceContext) {
    // TODO: Finalize the right resource name.
    const deploymentName = `${aksResourceContext.clusterName}-${InputParameters.namespace}-deployment-${utility_1.getRandomGuid()}`;
    return `${aksResourceContext.managementUrl}subscriptions/${aksResourceContext.subscriptionId}/resourceGroups/${aksResourceContext.resourceGroup}/providers/Microsoft.Devops/deploymentdetails/${deploymentName}?api-version=2020-12-01-preview`;
}
function createDeploymentReport(kubectl, deploymentConfig, runStatus) {
    return __awaiter(this, void 0, void 0, function* () {
        const clusterMetadata = kubeconfig_utility_1.getClusterMetadata();
        const resource = {
            type: 'kubernetes',
            name: clusterMetadata.name,
            uri: clusterMetadata.url,
            properties: {
                namespace: InputParameters.namespace,
                kubernetesObjects: kubectl.getDeployedObjects()
            }
        };
        const artifacts = InputParameters.containers.map((image) => {
            return {
                type: 'ContainerArtifact',
                image: image,
                dockerfileUrl: deploymentConfig.dockerfilePaths[image] || "",
                helmchartUrls: deploymentConfig.helmChartFilePaths,
                manifestUrls: deploymentConfig.manifestFilePaths
            };
        });
        const deploymentReport = new azure_actions_traceability_1.DeploymentReport();
        yield deploymentReport.initialize(InputParameters.githubToken, artifacts, runStatus, resource);
        const deploymentReportPath = deploymentReport.export();
        core.setOutput('deployment-report', deploymentReportPath);
        return Promise.resolve(deploymentReport);
    });
}
