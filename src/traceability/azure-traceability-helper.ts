import * as path from 'path';
import * as fs from 'fs';
import { DeploymentReport, TargetResource, Artifact } from '@azure/azure-actions-traceability';
import { WebRequest, WebRequestOptions, WebResponse, sendRequest, StatusCodes } from "../utilities/httpClient";
import * as InputParameters from "../input-parameters";
import * as core from '@actions/core';
import { Kubectl } from '../kubectl-object-model';
import { DeploymentConfig, getRandomGuid } from '../utilities/utility';
import { getClusterMetadata } from '../utilities/kubeconfig-utility';

const AKS_RESOURCE_TYPE = 'Microsoft.ContainerService/ManagedClusters';

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
    core.debug(`Trying to obtain AKS resource context from file: '${aksResourceContextPath}'`);
    const rawContent = fs.readFileSync(aksResourceContextPath, 'utf-8');
    return JSON.parse(rawContent);
  } catch (ex) {
    core.debug(`An error occured while reading/parsing the contents of the file: ${aksResourceContextPath}. Error: ${ex}`);
    return null;
  }
}

function getDeploymentPayload(deploymentReport: DeploymentReport, aksResourceContext: AksResourceContext): any {
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

async function createDeploymentResource(aksResourceContext: AksResourceContext, deploymentPayload: any): Promise<any> {
  return new Promise<string>((resolve, reject) => {
    var webRequest = new WebRequest();
    webRequest.method = 'PUT';
    webRequest.uri = getDeploymentResourceUri(aksResourceContext);
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

// Should not throw as it is executed in the finally block of run
export async function addTraceability(kubectl: Kubectl, deploymentConfig: DeploymentConfig, runStatus: string): Promise<void> {
  try {
    const deploymentReport = await createDeploymentReport(kubectl, deploymentConfig, runStatus);
    const aksResourceContext = getAksResourceContext();
    if (aksResourceContext !== null) {
      const deploymentPayload = getDeploymentPayload(deploymentReport, aksResourceContext);
      core.debug(`Trying to create the deployment resource with payload: \n${JSON.stringify(deploymentPayload)}`);
      const deploymentResource = await createDeploymentResource(aksResourceContext, deploymentPayload);
      core.debug(`Deployment resource created successfully. Deployment resource object: \n${JSON.stringify(deploymentResource)}`);
    }
  } catch (error) {
    core.warning(`Some error occured while adding traceability information: ${error}`);
  }

  return Promise.resolve();
}

function getAksResourceId(aksResourceContext: AksResourceContext): string {
  return `/subscriptions/${aksResourceContext.subscriptionId}/resourceGroups/${aksResourceContext.resourceGroup}/providers/Microsoft.ContainerService/managedClusters/${aksResourceContext.clusterName}`;
}

function getDeploymentResourceUri(aksResourceContext: AksResourceContext): string {
  // TODO: Finalize the right resource name.
  const deploymentName = `${aksResourceContext.clusterName}-${InputParameters.namespace}-deployment-${getRandomGuid()}`;
  return `${aksResourceContext.managementUrl}subscriptions/${aksResourceContext.subscriptionId}/resourceGroups/${aksResourceContext.resourceGroup}/providers/Microsoft.Devops/deploymentdetails/${deploymentName}?api-version=2020-12-01-preview`;
}

async function createDeploymentReport(kubectl: Kubectl, deploymentConfig: DeploymentConfig, runStatus: string): Promise<DeploymentReport> {
  const clusterMetadata = getClusterMetadata();
  const resource: TargetResource = {
    type: 'kubernetes',
    name: clusterMetadata.name,
    uri: clusterMetadata.url,
    properties: {
      namespace: InputParameters.namespace,
      kubernetesObjects: kubectl.getDeployedObjects()
    }
  };

  const artifacts: Artifact[] = InputParameters.containers.map((image): Artifact => {
    return {
      type: 'ContainerArtifact',
      image: image,
      dockerfileUrl: deploymentConfig.dockerfilePaths[image] || "",
      helmchartUrls: deploymentConfig.helmChartFilePaths,
      manifestUrls: deploymentConfig.manifestFilePaths
    }
  });

  const deploymentReport: DeploymentReport = new DeploymentReport();
  await deploymentReport.initialize(InputParameters.githubToken, artifacts, runStatus, resource);
  const deploymentReportPath = deploymentReport.export();

  core.setOutput('deployment-report', deploymentReportPath);
  return Promise.resolve(deploymentReport);
}