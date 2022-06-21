import * as core from "@actions/core";
import * as models from "../types/kubernetesTypes";
import * as KubernetesConstants from "../types/kubernetesTypes";
import { Kubectl, Resource } from "../types/kubectl";
import {
  getResources,
  updateManifestFiles,
} from "../utilities/manifestUpdateUtils";
import { routeBlueGreen } from "../strategyHelpers/blueGreen/blueGreenHelper";
import {
  annotateAndLabelResources,
  checkManifestStability,
  deployManifests,
} from "../strategyHelpers/deploymentHelper";
import { DeploymentStrategy } from "../types/deploymentStrategy";
import { parseTrafficSplitMethod } from "../types/trafficSplitMethod";
import { parseRouteStrategy } from "../types/routeStrategy";
export async function deploy(
  kubectl: Kubectl,
  manifestFilePaths: string[],
  deploymentStrategy: DeploymentStrategy
) {
  // update manifests
  const inputManifestFiles: string[] = updateManifestFiles(manifestFilePaths);
  core.debug("Input manifest files: " + inputManifestFiles);
  // deploy manifests
  core.startGroup("Deploying manifests");
  core.info('\u001b[1mBold Deploying manifests');
  const trafficSplitMethod = parseTrafficSplitMethod(
    core.getInput("traffic-split-method", { required: true })
  );
  const deployedManifestFiles = await deployManifests(
    inputManifestFiles,
    deploymentStrategy,
    kubectl,
    trafficSplitMethod
  );
  core.endGroup();
  core.debug("Deployed manifest files: " + deployedManifestFiles);
  // check manifest stability
  core.startGroup("Checking manifest stability");
  core.info('\u001b[1mBold Checking manifest stability');
  const resourceTypes: Resource[] = getResources(
    deployedManifestFiles,
    models.DEPLOYMENT_TYPES.concat([
      KubernetesConstants.DiscoveryAndLoadBalancerResource.SERVICE,
    ])
  );
  await checkManifestStability(kubectl, resourceTypes);
  core.endGroup();
  
  if (deploymentStrategy == DeploymentStrategy.BLUE_GREEN) {    
    core.group("Routing Blue/Green", async () => {
      core.info("\u001b[1mBold Routing blue green");
      const routeStrategy = parseRouteStrategy(
        core.getInput("route-method", { required: true })
      );
      await routeBlueGreen(kubectl, inputManifestFiles, routeStrategy);
    });
  }
  
  // print ingresses
  core.info("Printing ingresses");
  const ingressResources: Resource[] = getResources(deployedManifestFiles, [
    KubernetesConstants.DiscoveryAndLoadBalancerResource.INGRESS,
  ]);
  for (const ingressResource of ingressResources) {
    await kubectl.getResource(
      KubernetesConstants.DiscoveryAndLoadBalancerResource.INGRESS,
      ingressResource.name
    );
  }
  // annotate resources
  core.startGroup("Annotating resources")
  core.info("Annotating resources");
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