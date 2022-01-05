"use strict";

import * as core from "@actions/core";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { checkForErrors, sleep } from "../utility";
import { Kubectl } from "../../types/kubectl";
import { KubernetesWorkload } from "../../constants";
import * as fileHelper from "../files-helper";
import * as helper from "../resource-object-utility";
import * as TaskInputParameters from "../../input-parameters";
import { routeBlueGreenService } from "./service-blue-green-helper";
import { routeBlueGreenIngress } from "./ingress-blue-green-helper";
import { routeBlueGreenSMI } from "./smi-blue-green-helper";

export const BLUE_GREEN_DEPLOYMENT_STRATEGY = "BLUE-GREEN";
export const GREEN_LABEL_VALUE = "green";
export const NONE_LABEL_VALUE = "None";
export const BLUE_GREEN_VERSION_LABEL = "k8s.deploy.color";
export const GREEN_SUFFIX = "-green";
export const STABLE_SUFFIX = "-stable";
const INGRESS_ROUTE = "INGRESS";
const SMI_ROUTE = "SMI";

export function isBlueGreenDeploymentStrategy() {
  const deploymentStrategy = TaskInputParameters.deploymentStrategy;
  return (
    deploymentStrategy &&
    deploymentStrategy.toUpperCase() === BLUE_GREEN_DEPLOYMENT_STRATEGY
  );
}

export function isIngressRoute(): boolean {
  const routeMethod = TaskInputParameters.routeMethod;
  return routeMethod && routeMethod.toUpperCase() === INGRESS_ROUTE;
}

export function isSMIRoute(): boolean {
  const routeMethod = TaskInputParameters.routeMethod;
  return routeMethod && routeMethod.toUpperCase() === SMI_ROUTE;
}

export interface BlueGreenManifests {
  serviceEntityList: any[];
  serviceNameMap: Map<string, string>;
  unroutedServiceEntityList: any[];
  deploymentEntityList: any[];
  ingressEntityList: any[];
  otherObjects: any[];
}

export async function routeBlueGreen(
  kubectl: Kubectl,
  inputManifestFiles: string[]
) {
  // get buffer time
  let bufferTime: number = parseInt(TaskInputParameters.versionSwitchBuffer);

  //logging start of buffer time
  let dateNow = new Date();
  console.log(
    `Starting buffer time of ${bufferTime} minute(s) at ${dateNow.toISOString()}`
  );
  // waiting
  await sleep(bufferTime * 1000 * 60);
  // logging end of buffer time
  dateNow = new Date();
  console.log(
    `Stopping buffer time of ${bufferTime} minute(s) at ${dateNow.toISOString()}`
  );

  const manifestObjects: BlueGreenManifests =
    getManifestObjects(inputManifestFiles);
  // routing to new deployments
  if (isIngressRoute()) {
    routeBlueGreenIngress(
      kubectl,
      GREEN_LABEL_VALUE,
      manifestObjects.serviceNameMap,
      manifestObjects.ingressEntityList
    );
  } else if (isSMIRoute()) {
    routeBlueGreenSMI(
      kubectl,
      GREEN_LABEL_VALUE,
      manifestObjects.serviceEntityList
    );
  } else {
    routeBlueGreenService(
      kubectl,
      GREEN_LABEL_VALUE,
      manifestObjects.serviceEntityList
    );
  }
}

export function deleteWorkloadsWithLabel(
  kubectl: Kubectl,
  deleteLabel: string,
  deploymentEntityList: any[]
) {
  let resourcesToDelete = [];
  deploymentEntityList.forEach((inputObject) => {
    const name = inputObject.metadata.name;
    const kind = inputObject.kind;
    if (deleteLabel === NONE_LABEL_VALUE) {
      // if dellabel is none, deletes stable deployments
      const resourceToDelete = { name: name, kind: kind };
      resourcesToDelete.push(resourceToDelete);
    } else {
      // if dellabel is not none, then deletes new green deployments
      const resourceToDelete = {
        name: getBlueGreenResourceName(name, GREEN_SUFFIX),
        kind: kind,
      };
      resourcesToDelete.push(resourceToDelete);
    }
  });

  // deletes the deployments
  deleteObjects(kubectl, resourcesToDelete);
}

export function deleteWorkloadsAndServicesWithLabel(
  kubectl: Kubectl,
  deleteLabel: string,
  deploymentEntityList: any[],
  serviceEntityList: any[]
) {
  // need to delete services and deployments
  const deletionEntitiesList = deploymentEntityList.concat(serviceEntityList);
  let resourcesToDelete = [];
  deletionEntitiesList.forEach((inputObject) => {
    const name = inputObject.metadata.name;
    const kind = inputObject.kind;
    if (deleteLabel === NONE_LABEL_VALUE) {
      // if not dellabel, delete stable objects
      const resourceToDelete = { name: name, kind: kind };
      resourcesToDelete.push(resourceToDelete);
    } else {
      // else delete green labels
      const resourceToDelete = {
        name: getBlueGreenResourceName(name, GREEN_SUFFIX),
        kind: kind,
      };
      resourcesToDelete.push(resourceToDelete);
    }
  });
  deleteObjects(kubectl, resourcesToDelete);
}

export function deleteObjects(kubectl: Kubectl, deleteList: any[]) {
  // delete services and deployments
  deleteList.forEach((delObject) => {
    try {
      const result = kubectl.delete([delObject.kind, delObject.name]);
      checkForErrors([result]);
    } catch (ex) {
      // Ignore failures of delete if doesn't exist
    }
  });
}

export function getSuffix(label: string): string {
  if (label === GREEN_LABEL_VALUE) {
    return GREEN_SUFFIX;
  } else {
    return "";
  }
}

// other common functions
export function getManifestObjects(filePaths: string[]): BlueGreenManifests {
  const deploymentEntityList = [];
  const routedServiceEntityList = [];
  const unroutedServiceEntityList = [];
  const ingressEntityList = [];
  const otherEntitiesList = [];
  let serviceNameMap = new Map<string, string>();
  filePaths.forEach((filePath: string) => {
    const fileContents = fs.readFileSync(filePath);
    yaml.safeLoadAll(fileContents, function (inputObject) {
      if (!!inputObject) {
        const kind = inputObject.kind;
        const name = inputObject.metadata.name;
        if (helper.isDeploymentEntity(kind)) {
          deploymentEntityList.push(inputObject);
        } else if (helper.isServiceEntity(kind)) {
          if (isServiceRouted(inputObject, deploymentEntityList)) {
            routedServiceEntityList.push(inputObject);
            serviceNameMap.set(
              name,
              getBlueGreenResourceName(name, GREEN_SUFFIX)
            );
          } else {
            unroutedServiceEntityList.push(inputObject);
          }
        } else if (helper.isIngressEntity(kind)) {
          ingressEntityList.push(inputObject);
        } else {
          otherEntitiesList.push(inputObject);
        }
      }
    });
  });

  return {
    serviceEntityList: routedServiceEntityList,
    serviceNameMap: serviceNameMap,
    unroutedServiceEntityList: unroutedServiceEntityList,
    deploymentEntityList: deploymentEntityList,
    ingressEntityList: ingressEntityList,
    otherObjects: otherEntitiesList,
  };
}

export function isServiceRouted(
  serviceObject: any[],
  deploymentEntityList: any[]
): boolean {
  let shouldBeRouted: boolean = false;
  const serviceSelector: any = getServiceSelector(serviceObject);
  if (!!serviceSelector) {
    if (
      deploymentEntityList.some((depObject) => {
        // finding if there is a deployment in the given manifests the service targets
        const matchLabels: any = getDeploymentMatchLabels(depObject);
        return (
          !!matchLabels &&
          isServiceSelectorSubsetOfMatchLabel(serviceSelector, matchLabels)
        );
      })
    ) {
      shouldBeRouted = true;
    }
  }
  return shouldBeRouted;
}

export function createWorkloadsWithLabel(
  kubectl: Kubectl,
  deploymentObjectList: any[],
  nextLabel: string
) {
  const newObjectsList = [];
  deploymentObjectList.forEach((inputObject) => {
    // creating deployment with label
    const newBlueGreenObject = getNewBlueGreenObject(inputObject, nextLabel);
    core.debug(
      "New blue-green object is: " + JSON.stringify(newBlueGreenObject)
    );
    newObjectsList.push(newBlueGreenObject);
  });
  const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
  const result = kubectl.apply(manifestFiles);

  return { result: result, newFilePaths: manifestFiles };
}

export function getNewBlueGreenObject(
  inputObject: any,
  labelValue: string
): object {
  const newObject = JSON.parse(JSON.stringify(inputObject));

  // Updating name only if label is green label is given
  if (labelValue === GREEN_LABEL_VALUE) {
    newObject.metadata.name = getBlueGreenResourceName(
      inputObject.metadata.name,
      GREEN_SUFFIX
    );
  }

  // Adding labels and annotations
  addBlueGreenLabelsAndAnnotations(newObject, labelValue);

  return newObject;
}

export function addBlueGreenLabelsAndAnnotations(
  inputObject: any,
  labelValue: string
) {
  //creating the k8s.deploy.color label
  const newLabels = new Map<string, string>();
  newLabels[BLUE_GREEN_VERSION_LABEL] = labelValue;

  // updating object labels and selector labels
  helper.updateObjectLabels(inputObject, newLabels, false);
  helper.updateSelectorLabels(inputObject, newLabels, false);

  // updating spec labels if it is a service
  if (!helper.isServiceEntity(inputObject.kind)) {
    helper.updateSpecLabels(inputObject, newLabels, false);
  }
}

export function getBlueGreenResourceName(name: string, suffix: string) {
  return `${name}${suffix}`;
}

export function getDeploymentMatchLabels(deploymentObject: any): any {
  if (
    !!deploymentObject &&
    deploymentObject.kind.toUpperCase() ==
      KubernetesWorkload.pod.toUpperCase() &&
    !!deploymentObject.metadata &&
    !!deploymentObject.metadata.labels
  ) {
    return deploymentObject.metadata.labels;
  } else if (
    !!deploymentObject &&
    deploymentObject.spec &&
    deploymentObject.spec.selector &&
    deploymentObject.spec.selector.matchLabels
  ) {
    return deploymentObject.spec.selector.matchLabels;
  }
  return null;
}

export function getServiceSelector(serviceObject: any): any {
  if (!!serviceObject && serviceObject.spec && serviceObject.spec.selector) {
    return serviceObject.spec.selector;
  } else return null;
}

export function isServiceSelectorSubsetOfMatchLabel(
  serviceSelector: any,
  matchLabels: any
): boolean {
  let serviceSelectorMap = new Map();
  let matchLabelsMap = new Map();

  JSON.parse(JSON.stringify(serviceSelector), (key, value) => {
    serviceSelectorMap.set(key, value);
  });

  JSON.parse(JSON.stringify(matchLabels), (key, value) => {
    matchLabelsMap.set(key, value);
  });

  let isMatch = true;
  serviceSelectorMap.forEach((value, key) => {
    if (
      !!key &&
      (!matchLabelsMap.has(key) || matchLabelsMap.get(key)) != value
    ) {
      isMatch = false;
    }
  });

  return isMatch;
}

export function fetchResource(kubectl: Kubectl, kind: string, name: string) {
  const result = kubectl.getResource(kind, name);
  if (result == null || !!result.stderr) {
    return null;
  }

  if (!!result.stdout) {
    const resource = JSON.parse(result.stdout);
    try {
      UnsetsClusterSpecficDetails(resource);
      return resource;
    } catch (ex) {
      core.debug(
        "Exception occurred while Parsing " + resource + " in Json object"
      );
      core.debug(`Exception:${ex}`);
    }
  }
  return null;
}

function UnsetsClusterSpecficDetails(resource: any) {
  if (resource == null) {
    return;
  }

  // Unsets the cluster specific details in the object
  if (!!resource) {
    const metadata = resource.metadata;
    const status = resource.status;

    if (!!metadata) {
      const newMetadata = {
        annotations: metadata.annotations,
        labels: metadata.labels,
        name: metadata.name,
      };

      resource.metadata = newMetadata;
    }

    if (!!status) {
      resource.status = {};
    }
  }
}
