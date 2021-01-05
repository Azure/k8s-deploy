import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { DeploymentReport, TargetResource, Artifact } from '@azure/azure-actions-traceability';
import { WebRequest, WebRequestOptions, WebResponse, sendRequest, StatusCodes } from "../utilities/httpClient";
import * as InputParameters from "../input-parameters";
import * as core from '@actions/core';
import { Kubectl } from '../kubectl-object-model';

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
    core.debug(`An error occured while reading/parsing the contents of the file: ${aksResourceContextPath}. Error: ${ex}`);
    return null;
  }
}

function getDeploymentPayload(deploymentReport: DeploymentReport): any {
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

async function createDeploymentResource(aksResourceContext: AksResourceContext, deploymentPayload: any): Promise<any> {
  return new Promise<string>((resolve, reject) => {
    var webRequest = new WebRequest();
    webRequest.method = 'PUT';
    webRequest.uri = getResourceUri(aksResourceContext);
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

export async function addTraceability(kubectl: Kubectl): Promise<void> {
  const aksResourceContext = getAksResourceContext();
  if (aksResourceContext !== null) {
    const deploymentReport = getDeploymentReport(aksResourceContext, kubectl);
    const deploymentPayload = getDeploymentPayload(deploymentReport);
    try {
      console.log(`Trying to create the deployment resource with payload: \n${JSON.stringify(deploymentPayload)}`);
      const deploymentResource = await createDeploymentResource(aksResourceContext, deploymentPayload);
      console.log(`Deployment resource created successfully. Deployment resource object: \n${JSON.stringify(deploymentResource)}`);
    } catch (error) {
      core.warning(`Some error occured while creating the deployment resource for traceability: ${error}`);
    }
  }

  return Promise.resolve();
}

function getResourceUri(aksResourceContext: AksResourceContext): string {
  const deploymentName = `${aksResourceContext.clusterName}-${InputParameters.namespace}-deployment-${process.env['GITHUB_SHA']}`;
  return `${aksResourceContext.managementUrl}subscriptions/${aksResourceContext.subscriptionId}/resourceGroups/${aksResourceContext.resourceGroup}/providers/Microsoft.Devops/deploymentv2/${deploymentName}?api-version=2020-10-01-preview`;
}

function getDeploymentReport(context: AksResourceContext, kubectl: Kubectl) {
  const resource: TargetResource = {
    id: `/subscriptions/${context.subscriptionId}/resourceGroups/${context.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${context.clusterName}`,
    provider: 'Azure',
    type: 'Microsoft.ContainerService/managedClusters',
    properties: {
      namespace: InputParameters.namespace,
      kubernetesObjects: kubectl.getDeployedObjects()
    }
  };

  const artifact: Artifact = {
    type: 'container',
    properties: {
      "images": InputParameters.containers.map(image => {
        return {
          "image": image,
          "dockerfile": ""
        }
      }),
      "helmchart": [],
      "manifests": InputParameters.manifests 
    }
  };

  const deploymentReport: DeploymentReport = new DeploymentReport([ artifact ], 'succeeded', resource);
  const deploymentReportPath = deploymentReport.export();

  core.setOutput('deployment-report', deploymentReportPath);
  return deploymentReport;
}