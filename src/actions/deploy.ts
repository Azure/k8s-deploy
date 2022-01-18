import * as core from "@actions/core";
import * as KubernetesObjectUtility from "../utilities/resource-object-utility";
import * as models from "../constants";
import * as KubernetesConstants from "../constants";
import { Kubectl, Resource } from "../types/kubectl";
import { updateManifestFiles } from "../utilities/manifest-utilities";
import {
  isBlueGreenDeploymentStrategy,
  routeBlueGreen,
} from "../utilities/strategy-helpers/blue-green-helper";
import {
  deployManifests,
  isCanaryDeploymentStrategy,
  checkManifestStability,
  annotateAndLabelResources,
} from "../utilities/strategy-helpers/deployment-helper";
import {
  DeploymentStrategy,
  parseDeploymentStrategy,
} from "../types/deploymentStrategy";

export async function deploy(
  manifestFilePaths: string[],
  deploymentStrategy: DeploymentStrategy,
  kubectl: Kubectl
) {
  const inputManifestFiles: string[] = updateManifestFiles(manifestFilePaths);

  const deployedManifestFiles = await deployManifests(
    inputManifestFiles,
    deploymentStrategy,
    kubectl
  );

  // check manifest stability
  const resourceTypes: Resource[] = KubernetesObjectUtility.getResources(
    deployedManifestFiles,
    models.DEPLOYMENT_TYPES.concat([
      KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE,
    ])
  );
  await checkManifestStability(kubectl, resourceTypes);

  // route blue-green deployments
  if (isBlueGreenDeploymentStrategy()) {
    await routeBlueGreen(kubectl, inputManifestFiles);
  }

  // print ingresses
  const ingressResources: Resource[] = KubernetesObjectUtility.getResources(
    deployedManifestFiles,
    [KubernetesConstants.DiscoveryAndLoadBalancerResource.INGRESS]
  );
  for (const ingressResource of ingressResources) {
    await kubectl.getResource(
      KubernetesConstants.DiscoveryAndLoadBalancerResource.INGRESS,
      ingressResource.name
    );
  }

  // annotate resources
  let allPods;
  try {
    allPods = JSON.parse((await kubectl.getAllPods()).stdout);
  } catch (e) {
    core.debug("Unable to parse pods: " + e);
  }

  await annotateAndLabelResources(
    deployedManifestFiles,
    kubectl,
    resourceTypes,
    allPods
  );
}
