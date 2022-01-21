import * as core from "@actions/core";
import * as deploy from "./deploy";
import * as canaryDeploymentHelper from "../strategy-helpers/canary-deployment-helper";
import * as SMICanaryDeploymentHelper from "../strategy-helpers/smi-canary-deployment-helper";
import {getResources, updateManifestFiles} from "../utilities/manifestUpdateUtils";
import * as models from "../types/kubernetesTypes";
import * as KubernetesManifestUtility from "../utilities/manifestStabilityUtils";
import {
  BlueGreenManifests,
  deleteWorkloadsAndServicesWithLabel,
  deleteWorkloadsWithLabel,
  getManifestObjects,
  GREEN_LABEL_VALUE,
  isBlueGreenDeploymentStrategy,
  isIngressRoute,
  isSMIRoute,
  NONE_LABEL_VALUE,
} from "../strategy-helpers/blue-green-helper";
import {promoteBlueGreenService, routeBlueGreenService,} from "../strategy-helpers/service-blue-green-helper";
import {promoteBlueGreenIngress, routeBlueGreenIngress,} from "../strategy-helpers/ingress-blue-green-helper";
import {cleanupSMI, promoteBlueGreenSMI, routeBlueGreenSMI,} from "../strategy-helpers/smi-blue-green-helper";
import {Kubectl, Resource} from "../types/kubectl";
import {DeploymentStrategy} from "../types/deploymentStrategy";

export async function promote(kubectl: Kubectl, manifests: string[]) {
  if (canaryDeploymentHelper.isCanaryDeploymentStrategy()) {
    await promoteCanary(kubectl, manifests);
  } else if (isBlueGreenDeploymentStrategy()) {
    await promoteBlueGreen(kubectl, manifests);
  } else {
    throw Error("Invalid promote action deployment strategy");
  }
}

async function promoteCanary(kubectl: Kubectl, manifests: string[]) {
  let includeServices = false;

  if (canaryDeploymentHelper.isSMICanaryStrategy()) {
    includeServices = true;

    // In case of SMI traffic split strategy when deployment is promoted, first we will redirect traffic to
    // canary deployment, then update stable deployment and then redirect traffic to stable deployment
    core.debug("Redirecting traffic to canary deployment");
    await SMICanaryDeploymentHelper.redirectTrafficToCanaryDeployment(
      kubectl,
      manifests
    );

    core.debug("Deploying input manifests with SMI canary strategy");
    await deploy.deploy(kubectl, manifests, DeploymentStrategy.CANARY);

    core.debug("Redirecting traffic to stable deployment");
    await SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(
      kubectl,
      manifests
    );
  } else {
    core.debug("Deploying input manifests");
    await deploy.deploy(kubectl, manifests, DeploymentStrategy.CANARY);
  }

  core.debug(
    "Deployment strategy selected is Canary. Deleting canary and baseline workloads."
  );
  try {
    canaryDeploymentHelper.deleteCanaryDeployment(
      kubectl,
      manifests,
      includeServices
    );
  } catch (ex) {
    core.warning(
      "Exception occurred while deleting canary and baseline workloads: " + ex
    );
  }
}

async function promoteBlueGreen(kubectl: Kubectl, manifests: string[]) {
  // update container images and pull secrets
  const inputManifestFiles: string[] = updateManifestFiles(manifests);
  const manifestObjects: BlueGreenManifests =
    getManifestObjects(inputManifestFiles);

  core.debug("Deleting old deployment and making new ones");
  let result;
  if (isIngressRoute()) {
    result = await promoteBlueGreenIngress(kubectl, manifestObjects);
  } else if (isSMIRoute()) {
    result = await promoteBlueGreenSMI(kubectl, manifestObjects);
  } else {
    result = await promoteBlueGreenService(kubectl, manifestObjects);
  }

  // checking stability of newly created deployments
  const deployedManifestFiles = result.newFilePaths;
  const resources: Resource[] = getResources(
    deployedManifestFiles,
    models.DEPLOYMENT_TYPES.concat([
      models.DiscoveryAndLoadBalancerResource.SERVICE,
    ])
  );
  await KubernetesManifestUtility.checkManifestStability(kubectl, resources);

  core.debug("Routing to new deployments");
  if (isIngressRoute()) {
    await routeBlueGreenIngress(
      kubectl,
      null,
      manifestObjects.serviceNameMap,
      manifestObjects.ingressEntityList
    );
    await deleteWorkloadsAndServicesWithLabel(
      kubectl,
      GREEN_LABEL_VALUE,
      manifestObjects.deploymentEntityList,
      manifestObjects.serviceEntityList
    );
  } else if (isSMIRoute()) {
    await routeBlueGreenSMI(
      kubectl,
      NONE_LABEL_VALUE,
      manifestObjects.serviceEntityList
    );
    await deleteWorkloadsWithLabel(
      kubectl,
      GREEN_LABEL_VALUE,
      manifestObjects.deploymentEntityList
    );
    await cleanupSMI(kubectl, manifestObjects.serviceEntityList);
  } else {
    await routeBlueGreenService(
      kubectl,
      NONE_LABEL_VALUE,
      manifestObjects.serviceEntityList
    );
    await deleteWorkloadsWithLabel(
      kubectl,
      GREEN_LABEL_VALUE,
      manifestObjects.deploymentEntityList
    );
  }
}
