import { Kubectl } from "../../types/kubectl";
import * as fs from "fs";
import * as yaml from "js-yaml";
import * as core from "@actions/core";
import * as TaskInputParameters from "../../input-parameters";
import * as helper from "../resource-object-utility";
import { KubernetesWorkload } from "../../constants";
import { StringComparer, isEqual } from "../string-comparison";
import { checkForErrors } from "../utility";
import * as utils from "../manifest-utilities";

export const CANARY_DEPLOYMENT_STRATEGY = "CANARY";
export const TRAFFIC_SPLIT_STRATEGY = "SMI";
export const CANARY_VERSION_LABEL = "workflow/version";
const BASELINE_SUFFIX = "-baseline";
export const BASELINE_LABEL_VALUE = "baseline";
const CANARY_SUFFIX = "-canary";
export const CANARY_LABEL_VALUE = "canary";
export const STABLE_SUFFIX = "-stable";
export const STABLE_LABEL_VALUE = "stable";

export function deleteCanaryDeployment(
  kubectl: Kubectl,
  manifestFilePaths: string[],
  includeServices: boolean
) {
  if (manifestFilePaths == null || manifestFilePaths.length == 0) {
    throw new Error("Manifest file not found");
  }

  cleanUpCanary(kubectl, manifestFilePaths, includeServices);
}

export function markResourceAsStable(inputObject: any): object {
  if (isResourceMarkedAsStable(inputObject)) {
    return inputObject;
  }

  const newObject = JSON.parse(JSON.stringify(inputObject));

  addCanaryLabelsAndAnnotations(newObject, STABLE_LABEL_VALUE);
  core.debug("Added stable label: " + JSON.stringify(newObject));

  return newObject;
}

export function isResourceMarkedAsStable(inputObject: any): boolean {
  return (
    inputObject?.metadata?.labels[CANARY_VERSION_LABEL] === STABLE_LABEL_VALUE
  );
}

export function getStableResource(inputObject: any): object {
  const replicaCount = specContainsReplicas(inputObject.kind)
    ? inputObject.metadata.replicas
    : 0;

  return getNewCanaryObject(inputObject, replicaCount, STABLE_LABEL_VALUE);
}

export function getNewBaselineResource(
  stableObject: any,
  replicas?: number
): object {
  return getNewCanaryObject(stableObject, replicas, BASELINE_LABEL_VALUE);
}

export function getNewCanaryResource(
  inputObject: any,
  replicas?: number
): object {
  return getNewCanaryObject(inputObject, replicas, CANARY_LABEL_VALUE);
}

export function fetchCanaryResource(
  kubectl: Kubectl,
  kind: string,
  name: string
): object {
  return fetchResource(kubectl, kind, getCanaryResourceName(name));
}

export async function fetchResource(
  kubectl: Kubectl,
  kind: string,
  name: string
) {
  const result = await kubectl.getResource(kind, name);

  if (!result || result?.stderr) {
    return null;
  }

  if (result.stdout) {
    const resource = JSON.parse(result.stdout);

    try {
      utils.UnsetClusterSpecficDetails(resource);
      return resource;
    } catch (ex) {
      core.debug(
        `Exception occurred while Parsing ${resource} in JSON object: ${ex}`
      );
    }
  }
}

export function isCanaryDeploymentStrategy() {
  const deploymentStrategy = core.getInput("strategy");
  return deploymentStrategy?.toUpperCase() === CANARY_DEPLOYMENT_STRATEGY;
}

export function isSMICanaryStrategy() {
  const deploymentStrategy = core.getInput("traffic-split-method");

  return (
    isCanaryDeploymentStrategy() &&
    deploymentStrategy?.toUpperCase() === TRAFFIC_SPLIT_STRATEGY
  );
}

export function getCanaryResourceName(name: string) {
  return name + CANARY_SUFFIX;
}

export function getBaselineResourceName(name: string) {
  return name + BASELINE_SUFFIX;
}

export function getStableResourceName(name: string) {
  return name + STABLE_SUFFIX;
}

function getNewCanaryObject(
  inputObject: any,
  replicas: number,
  type: string
): object {
  const newObject = JSON.parse(JSON.stringify(inputObject));

  // Updating name
  if (type === CANARY_LABEL_VALUE) {
    newObject.metadata.name = getCanaryResourceName(inputObject.metadata.name);
  } else if (type === STABLE_LABEL_VALUE) {
    newObject.metadata.name = getStableResourceName(inputObject.metadata.name);
  } else {
    newObject.metadata.name = getBaselineResourceName(
      inputObject.metadata.name
    );
  }

  addCanaryLabelsAndAnnotations(newObject, type);

  if (specContainsReplicas(newObject.kind)) {
    newObject.spec.replicas = replicas;
  }

  return newObject;
}

function specContainsReplicas(kind: string) {
  return (
    kind.toLowerCase() !== KubernetesWorkload.POD.toLowerCase() &&
    kind.toLowerCase() !== KubernetesWorkload.DAEMON_SET.toLowerCase() &&
    !helper.isServiceEntity(kind)
  );
}

function addCanaryLabelsAndAnnotations(inputObject: any, type: string) {
  const newLabels = new Map<string, string>();
  newLabels[CANARY_VERSION_LABEL] = type;

  helper.updateObjectLabels(inputObject, newLabels, false);
  helper.updateObjectAnnotations(inputObject, newLabels, false);
  helper.updateSelectorLabels(inputObject, newLabels, false);

  if (!helper.isServiceEntity(inputObject.kind)) {
    helper.updateSpecLabels(inputObject, newLabels, false);
  }
}

function cleanUpCanary(
  kubectl: Kubectl,
  files: string[],
  includeServices: boolean
) {
  const deleteObject = async function (kind, name) {
    try {
      const result = await kubectl.delete([kind, name]);
      checkForErrors([result]);
    } catch (ex) {
      // Ignore failures of delete if it doesn't exist
    }
  };

  files.forEach((filePath: string) => {
    const fileContents = fs.readFileSync(filePath).toString();

    yaml.safeLoadAll(fileContents, async function (inputObject) {
      const name = inputObject.metadata.name;
      const kind = inputObject.kind;

      if (
        helper.isDeploymentEntity(kind) ||
        (includeServices && helper.isServiceEntity(kind))
      ) {
        const canaryObjectName = getCanaryResourceName(name);
        const baselineObjectName = getBaselineResourceName(name);

        await deleteObject(kind, canaryObjectName);
        await deleteObject(kind, baselineObjectName);
      }
    });
  });
}
