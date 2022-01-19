import * as core from "@actions/core";
import * as canaryDeploymentHelper from "../strategy-helpers/canary-deployment-helper";
import * as SMICanaryDeploymentHelper from "../strategy-helpers/smi-canary-deployment-helper";
import { Kubectl } from "../types/kubectl";
import { rejectBlueGreenService } from "../strategy-helpers/service-blue-green-helper";
import { rejectBlueGreenIngress } from "../strategy-helpers/ingress-blue-green-helper";
import { rejectBlueGreenSMI } from "../strategy-helpers/smi-blue-green-helper";
import {
  isSMIRoute,
  isIngressRoute,
  isBlueGreenDeploymentStrategy,
} from "../strategy-helpers/blue-green-helper";

export async function reject(kubectl: Kubectl, manifests: string[]) {
  if (canaryDeploymentHelper.isCanaryDeploymentStrategy()) {
    await rejectCanary(kubectl, manifests);
  } else if (isBlueGreenDeploymentStrategy()) {
    await rejectBlueGreen(kubectl, manifests);
  } else {
    core.debug(
      "Strategy is not canary or blue-green deployment. Invalid request."
    );
    throw "Invalid delete action deployment strategy";
  }
}

async function rejectCanary(kubectl: Kubectl, manifests: string[]) {
  let includeServices = false;

  if (canaryDeploymentHelper.isSMICanaryStrategy()) {
    core.debug("Reject deployment with SMI canary strategy");
    includeServices = true;

    SMICanaryDeploymentHelper.redirectTrafficToStableDeployment(
      kubectl,
      manifests
    );
  }

  core.debug("Deleting baseline and canary workloads");
  canaryDeploymentHelper.deleteCanaryDeployment(
    kubectl,
    manifests,
    includeServices
  );
}

async function rejectBlueGreen(kubectl: Kubectl, manifests: string[]) {
  if (isIngressRoute()) {
    await rejectBlueGreenIngress(kubectl, manifests);
  } else if (isSMIRoute()) {
    await rejectBlueGreenSMI(kubectl, manifests);
  } else {
    await rejectBlueGreenService(kubectl, manifests);
  }
}
