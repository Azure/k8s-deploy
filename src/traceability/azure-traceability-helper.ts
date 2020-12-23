import * as path from 'path';
import * as fs from 'fs';
import { DeploymentReport } from '@azure/azure-actions-traceability';
import {  TargetResource, Artifact } from '@azure/azure-actions-traceability/lib/models';
import { WebRequest, WebRequestOptions, WebResponse, sendRequest, StatusCodes } from "../utilities/httpClient";
import * as InputParameters from "../input-parameters";
import * as core from '@actions/core';

interface AksResourceContext {
  subscriptionId: string;
  resourceGroup: string;
  clusterName: string;
  sessionToken: string;
  managementUrl: string;
}

function getAksResourceContext(): AksResourceContext {
  const runnerTempDirectory = process.env['RUNNER_TEMP'];
  const aksResourceContextPath = path.join(runnerTempDirectory, `aks-resource-context.json`);
  try {
    console.log(`Reading file: ${aksResourceContextPath}`);
    const rawContent = fs.readFileSync(aksResourceContextPath, 'utf-8');
    return JSON.parse(rawContent);
  } catch (ex) {
    throw new Error(`An error occured while reading/parsing the contents of the file: ${aksResourceContextPath}. Error: ${ex}`);
  }
}

function getDeploymentPayload(aksResourceContext: AksResourceContext, deploymentName: string): any {
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

async function createDeploymentResource(aksResourceContext: AksResourceContext, deploymentPayload: any): Promise<any> {
  const deploymentName = `${aksResourceContext.clusterName}-${InputParameters.namespace}-deployment-${process.env['GITHUB_SHA']}`;
  return new Promise<string>((resolve, reject) => {
    var webRequest = new WebRequest();
    webRequest.method = 'PUT';
    webRequest.uri = `${aksResourceContext.managementUrl}subscriptions/${aksResourceContext.subscriptionId}/resourceGroups/${aksResourceContext.resourceGroup}/providers/Microsoft.DeploymentCenterV2/deploymentsv2/${deploymentName}?api-version=2020-06-01-preview`;
    console.log(`Deployment resource URI: ${webRequest.uri}`);
    webRequest.headers = {
      'Authorization': 'Bearer ' + aksResourceContext.sessionToken,
      'Content-Type': 'application/json; charset=utf-8'
    }
    webRequest.body = JSON.stringify(deploymentPayload);
    sendRequest(webRequest).then((response: WebResponse) => {
      if (response.statusCode == StatusCodes.OK
        || response.statusCode == StatusCodes.CREATED
        || response.statusCode == StatusCodes.ACCEPTED) {
        resolve(response.body);
      } else {
        console.log(`An error occured while creating the deployment resource. Response body: '${JSON.stringify(response.body)}'`);
        reject(JSON.stringify(response.body));
      }
    }).catch(reject);
  });
}

export async function addTraceability(deploymentName): Promise<void> {
  const aksResourceContext = getAksResourceContext();
  let deploymentPayload = getDeploymentPayload(aksResourceContext, deploymentName);
  createDeploymentReport(aksResourceContext, deploymentName);
  try {
    console.log(`Trying to create the deployment resource with payload: \n${JSON.stringify(deploymentPayload)}`);
    const deploymentResource = await createDeploymentResource(aksResourceContext, deploymentPayload);
    console.log(`Deployment resource created successfully. Deployment resource object: \n${JSON.stringify(deploymentResource)}`);
  } catch (error) {
    console.log(`Some error occured: ${error}`);
  }
}

function createDeploymentReport(context: AksResourceContext, deploymentManifests: string) {
  const resource: TargetResource = {
    id: `/subscriptions/${context.subscriptionId}/resourceGroups/${context.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${context.clusterName}`,
    provider: 'Azure',
    type: 'Microsoft.ContainerService/managedClusters',
    properties: {
      manifests: deploymentManifests
    }
  };

  const artifact: Artifact = {
    type: 'container',
    properties: {}
  };

  const deploymentReport: DeploymentReport = new DeploymentReport([ artifact ], 'succeeded', resource);
  const deploymentReportPath = deploymentReport.export();
  core.setOutput('deployment-report', deploymentReportPath);
}