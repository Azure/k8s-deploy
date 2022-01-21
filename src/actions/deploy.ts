import * as core from "@actions/core";
import * as models from "../types/kubernetesTypes";
import * as KubernetesConstants from "../types/kubernetesTypes";
import {Kubectl, Resource} from "../types/kubectl";
import {getResources, updateManifestFiles} from "../utilities/manifestUpdateUtils";
import { routeBlueGreen,} from "../strategy-helpers/blue-green-helper";
import {
  annotateAndLabelResources,
  checkManifestStability,
  deployManifests,
} from "../strategy-helpers/deployment-helper";
import {DeploymentStrategy,} from "../types/deploymentStrategy";

export async function deploy(
  kubectl: Kubectl,
  manifestFilePaths: string[],
  deploymentStrategy: DeploymentStrategy
) {
  const inputManifestFiles: string[] = updateManifestFiles(manifestFilePaths);

  const deployedManifestFiles = await deployManifests(
    inputManifestFiles,
    deploymentStrategy,
    kubectl
  );

  // check manifest stability
  const resourceTypes: Resource[] = getResources(
    deployedManifestFiles,
    models.DEPLOYMENT_TYPES.concat([
      KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE,
    ])
  );
  await checkManifestStability(kubectl, resourceTypes);

  // route blue-green deployments
  if (deploymentStrategy == DeploymentStrategy.BLUE_GREEN) {
    await routeBlueGreen(kubectl, inputManifestFiles);
  }

  // print ingresses
  const ingressResources: Resource[] = getResources(
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
