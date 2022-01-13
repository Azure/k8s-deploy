"use strict";

import * as fs from "fs";
import * as yaml from "js-yaml";
import * as canaryDeploymentHelper from "./canary-deployment-helper";
import * as KubernetesObjectUtility from "../resource-object-utility";
import * as TaskInputParameters from "../../input-parameters";
import * as models from "../../constants";
import * as fileHelper from "../files-helper";
import * as KubernetesManifestUtility from "../manifest-stability-utility";
import { Kubectl, Resource } from "../../types/kubectl";

import { deployPodCanary } from "./pod-canary-deployment-helper";
import { deploySMICanary } from "./smi-canary-deployment-helper";
import {
  checkForErrors,
  annotateChildPods,
  getWorkflowFilePath,
  getLastSuccessfulRunSha,
  getDeploymentConfig,
  normaliseWorkflowStrLabel,
} from "../utility";
import { DeploymentConfig } from "../../types/deploymentConfig";
import { isIngressRoute, isSMIRoute } from "./blue-green-helper";
import { deployBlueGreenService } from "./service-blue-green-helper";
import { deployBlueGreenIngress } from "./ingress-blue-green-helper";
import { deployBlueGreenSMI } from "./smi-blue-green-helper";
import { DeploymentStrategy } from "../../types/deploymentStrategy";
import * as core from "@actions/core";
import {
  parseTrafficSplitMethod,
  TrafficSplitMethod,
} from "../../types/trafficSplitMethod";
import { parseRouteStrategy, RouteStrategy } from "../../types/routeStrategy";
import { ExecOutput } from "@actions/exec";

export async function deployManifests(
  files: string[],
  deploymentStrategy: DeploymentStrategy,
  kubectl: Kubectl
): Promise<string[]> {
  switch (deploymentStrategy) {
    case DeploymentStrategy.CANARY: {
      const trafficSplitMethod = parseTrafficSplitMethod(
        core.getInput("traffic-split-method", { required: true })
      );

      const { result, newFilePaths } =
        trafficSplitMethod == TrafficSplitMethod.SMI
          ? await deploySMICanary(files, kubectl)
          : await deployPodCanary(files, kubectl);

      checkForErrors([result]);
      return newFilePaths;
    }

    case DeploymentStrategy.BLUE_GREEN: {
      const routeStrategy = parseRouteStrategy(
        core.getInput("route-method", { required: true })
      );

      const { result, newFilePaths } = await Promise.resolve(
        (routeStrategy == RouteStrategy.INGRESS &&
          deployBlueGreenIngress(kubectl, files)) ||
          (routeStrategy == RouteStrategy.SMI &&
            deployBlueGreenSMI(kubectl, files)) ||
          deployBlueGreenService(kubectl, files)
      );

      checkForErrors([result]);
      return newFilePaths;
    }

    case undefined: {
      core.warning("Deployment strategy is not recognized.");
    }
    default: {
      const trafficSplitMethod = parseTrafficSplitMethod(
        core.getInput("traffic-split-method", { required: true })
      );

      if (trafficSplitMethod === TrafficSplitMethod.SMI) {
        const updatedManifests = appendStableVersionLabelToResource(
          files,
          kubectl
        );

        const result = await kubectl.apply(
          updatedManifests,
          TaskInputParameters.forceDeployment
        );
        checkForErrors([result]);
      } else {
        const result = await kubectl.apply(
          files,
          TaskInputParameters.forceDeployment
        );
        checkForErrors([result]);
      }

      return files;
    }
  }
}

function appendStableVersionLabelToResource(
  files: string[],
  kubectl: Kubectl
): string[] {
  const manifestFiles = [];
  const newObjectsList = [];

  files.forEach((filePath: string) => {
    const fileContents = fs.readFileSync(filePath).toString();

    yaml.safeLoadAll(fileContents, function (inputObject) {
      const { kind } = inputObject;

      if (KubernetesObjectUtility.isDeploymentEntity(kind)) {
        const updatedObject =
          canaryDeploymentHelper.markResourceAsStable(inputObject);
        newObjectsList.push(updatedObject);
      } else {
        manifestFiles.push(filePath);
      }
    });
  });

  const updatedManifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
  manifestFiles.push(...updatedManifestFiles);

  return manifestFiles;
}

export async function checkManifestStability(
  kubectl: Kubectl,
  resources: Resource[]
): Promise<void> {
  await KubernetesManifestUtility.checkManifestStability(kubectl, resources);
}

export async function annotateAndLabelResources(
  files: string[],
  kubectl: Kubectl,
  resourceTypes: Resource[],
  allPods: any
) {
  const githubToken = core.getInput("token");
  const workflowFilePath = await getWorkflowFilePath(githubToken);

  const deploymentConfig = await getDeploymentConfig();
  const annotationKeyLabel =
    models.getWorkflowAnnotationKeyLabel(workflowFilePath);

  await annotateResources(
    files,
    kubectl,
    resourceTypes,
    allPods,
    annotationKeyLabel,
    workflowFilePath,
    deploymentConfig
  );
  labelResources(files, kubectl, annotationKeyLabel);
}

async function annotateResources(
  files: string[],
  kubectl: Kubectl,
  resourceTypes: Resource[],
  allPods: any,
  annotationKey: string,
  workflowFilePath: string,
  deploymentConfig: DeploymentConfig
) {
  const annotateResults: ExecOutput[] = [];
  const lastSuccessSha = await getLastSuccessfulRunSha(
    kubectl,
    TaskInputParameters.namespace,
    annotationKey
  );

  let annotationKeyValStr = `${annotationKey}=${models.getWorkflowAnnotationsJson(
    lastSuccessSha,
    workflowFilePath,
    deploymentConfig
  )}`;
  annotateResults.push(
    await kubectl.annotate(
      "namespace",
      TaskInputParameters.namespace,
      annotationKeyValStr
    )
  );
  annotateResults.push(await kubectl.annotateFiles(files, annotationKeyValStr));

  resourceTypes.forEach(async (resource) => {
    if (
      resource.type.toLowerCase() !==
      models.KubernetesWorkload.POD.toLowerCase()
    ) {
      (
        await annotateChildPods(
          kubectl,
          resource.type,
          resource.name,
          annotationKeyValStr,
          allPods
        )
      ).forEach((execResult) => annotateResults.push(execResult));
    }
  });

  checkForErrors(annotateResults, true);
}

async function labelResources(
  files: string[],
  kubectl: Kubectl,
  label: string
) {
  const labels = [
    `workflowFriendlyName=${normaliseWorkflowStrLabel(
      process.env.GITHUB_WORKFLOW
    )}`,
    `workflow=${label}`,
  ];

  checkForErrors([await kubectl.labelFiles(files, labels)], true);
}

export function isCanaryDeploymentStrategy(
  deploymentStrategy: string
): boolean {
  return (
    deploymentStrategy?.toLowerCase() ===
    canaryDeploymentHelper.CANARY_DEPLOYMENT_STRATEGY.toLowerCase()
  );
}
