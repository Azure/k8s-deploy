import * as core from "@actions/core";
import * as deploymentHelper from "../utilities/strategy-helpers/deployment-helper";
import * as deploy from "./deploy";
import * as canaryDeploymentHelper from "../utilities/strategy-helpers/canary-deployment-helper";
import * as SMICanaryDeploymentHelper from "../utilities/strategy-helpers/smi-canary-deployment-helper";
import * as utils from "../utilities/manifest-utilities";
import * as TaskInputParameters from "../input-parameters";
import { updateManifestFiles } from "../utilities/manifest-utilities";
import * as KubernetesObjectUtility from "../utilities/resource-object-utility";
import * as models from "../constants";
import * as KubernetesManifestUtility from "../utilities/manifest-stability-utility";
import {
  getManifestObjects,
  deleteWorkloadsWithLabel,
  deleteWorkloadsAndServicesWithLabel,
  BlueGreenManifests,
} from "../utilities/strategy-helpers/blue-green-helper";
import {
  isBlueGreenDeploymentStrategy,
  isIngressRoute,
  isSMIRoute,
  GREEN_LABEL_VALUE,
  NONE_LABEL_VALUE,
} from "../utilities/strategy-helpers/blue-green-helper";
import {
  routeBlueGreenService,
  promoteBlueGreenService,
} from "../utilities/strategy-helpers/service-blue-green-helper";
import {
  routeBlueGreenIngress,
  promoteBlueGreenIngress,
} from "../utilities/strategy-helpers/ingress-blue-green-helper";
import {
  routeBlueGreenSMI,
  promoteBlueGreenSMI,
  cleanupSMI,
} from "../utilities/strategy-helpers/smi-blue-green-helper";
import { Kubectl, Resource } from "../types/kubectl";
import { DeploymentStrategy } from "../types/deploymentStrategy";

export async function promote() {
  const namespace: string = core.getInput("namespace") || "default";
  const kubectl = new Kubectl(await utils.getKubectl(), namespace, true);

  if (canaryDeploymentHelper.isCanaryDeploymentStrategy()) {
    await promoteCanary(kubectl);
  } else if (isBlueGreenDeploymentStrategy()) {
    await promoteBlueGreen(kubectl);
  } else {
    throw Error("Invalid promote action deployment strategy");
  }
}

async function promoteCanary(kubectl: Kubectl) {
  let includeServices = false;
  const manifests = core
    .getInput("manifests")
    .split(/[\n,;]+/)
    .filter((manifest) => manifest.trim().length > 0);

  if (canaryDeploymentHelper.isSMICanaryStrategy()) {
    includeServices = true;

    // In case of SMI traffic split strategy when deployment is promoted, first we will redirect traffic to
    // canary deployment, then update stable deployment and then redirect traffic to stable deployment
    core.debug("Redirecting traffic to canary deployment");
    SMICanaryDeploymentHelper.redirectTrafficToCanaryDeployment(
      kubectl,
      manifests
    );

    core.debug("Deploying input manifests with SMI canary strategy");
    await deploy.deploy(manifests, DeploymentStrategy.CANARY, kubectl);

    core.debug("Redirecting traffic to stable deployment");
    SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(
      kubectl,
      manifests
    );
  } else {
    core.debug("Deploying input manifests");
    await deploy.deploy(manifests, DeploymentStrategy.CANARY, kubectl);
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

async function promoteBlueGreen(kubectl: Kubectl) {
  const manifests = core
    .getInput("manifests")
    .split(/[\n,;]+/)
    .filter((manifest) => manifest.trim().length > 0);

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
  const resources: Resource[] = KubernetesObjectUtility.getResources(
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
    deleteWorkloadsAndServicesWithLabel(
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
    deleteWorkloadsWithLabel(
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
    deleteWorkloadsWithLabel(
      kubectl,
      GREEN_LABEL_VALUE,
      manifestObjects.deploymentEntityList
    );
  }
}
