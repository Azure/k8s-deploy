"use strict";
import * as fs from "fs";
import * as core from "@actions/core";
import * as yaml from "js-yaml";
import { Resource } from "../types/kubectl";
import {
  KubernetesWorkload,
  DEPLOYMENT_TYPES,
  WORKLOAD_TYPES,
} from "../types/kubernetes-types";
import { StringComparer, isEqual } from "./string-comparison";

const ResourceKindNotDefinedError = Error("Resource kind not defined");
const NullInputObjectError = Error("Null inputObject");
const InputObjectKindNotDefinedError = Error("Input object kind not defined");
const InputObjectMetadataNotDefinedError = Error(
  "Input object metatada not defined"
);

export function isDeploymentEntity(kind: string): boolean {
  if (!kind) {
    throw ResourceKindNotDefinedError;
  }

  return DEPLOYMENT_TYPES.some((type: string) => {
    return type.toLowerCase() === kind.toLowerCase();
  });
}

export function isWorkloadEntity(kind: string): boolean {
  return WORKLOAD_TYPES.some(
    (type: string) => type.toUpperCase() === kind.toUpperCase()
  );
}

export function isServiceEntity(kind: string): boolean {
  if (!kind) {
    throw ResourceKindNotDefinedError;
  }

  return "service" === kind.toLowerCase();
}

export function isIngressEntity(kind: string): boolean {
  if (!kind) {
    throw ResourceKindNotDefinedError;
  }

  return "ingress" === kind.toLowerCase();
}

export function getReplicaCount(inputObject: any): any {
  if (!inputObject) {
    throw NullInputObjectError;
  }

  if (!inputObject.kind) {
    throw InputObjectKindNotDefinedError;
  }

  const { kind } = inputObject;
  if (
    kind.toLowerCase() !== KubernetesWorkload.POD.toLowerCase() &&
    kind.toLowerCase() !== KubernetesWorkload.DAEMON_SET.toLowerCase()
  )
    return inputObject.spec.replicas;

  return 0;
}

export function updateObjectLabels(
  inputObject: any,
  newLabels: Map<string, string>,
  override: boolean = false
) {
  if (!inputObject) {
    throw NullInputObjectError;
  }

  if (!inputObject.metadata) {
    throw InputObjectMetadataNotDefinedError;
  }

  if (!newLabels) {
    return;
  }

  if (override) {
    inputObject.metadata.labels = newLabels;
  } else {
    let existingLabels =
      inputObject.metadata.labels || new Map<string, string>();

    Object.keys(newLabels).forEach(
      (key) => (existingLabels[key] = newLabels[key])
    );

    inputObject.metadata.labels = existingLabels;
  }
}

export function updateObjectAnnotations(
  inputObject: any,
  newAnnotations: Map<string, string>,
  override: boolean = false
) {
  if (!inputObject) {
    throw NullInputObjectError;
  }

  if (!inputObject.metadata) {
    throw InputObjectMetadataNotDefinedError;
  }

  if (!newAnnotations) {
    return;
  }

  if (override) {
    inputObject.metadata.annotations = newAnnotations;
  } else {
    let existingAnnotations =
      inputObject.metadata.annotations || new Map<string, string>();

    Object.keys(newAnnotations).forEach(
      (key) => (existingAnnotations[key] = newAnnotations[key])
    );

    inputObject.metadata.annotations = existingAnnotations;
  }
}

export function updateImagePullSecrets(
  inputObject: any,
  newImagePullSecrets: string[],
  override: boolean = false
) {
  if (!inputObject?.spec || !newImagePullSecrets) {
    return;
  }

  const newImagePullSecretsObjects = Array.from(newImagePullSecrets, (name) => {
    return { name };
  });
  let existingImagePullSecretObjects: any = getImagePullSecrets(inputObject);

  if (override) {
    existingImagePullSecretObjects = newImagePullSecretsObjects;
  } else {
    existingImagePullSecretObjects =
      existingImagePullSecretObjects || new Array();

    existingImagePullSecretObjects = existingImagePullSecretObjects.concat(
      newImagePullSecretsObjects
    );
  }

  setImagePullSecrets(inputObject, existingImagePullSecretObjects);
}

export function updateSpecLabels(
  inputObject: any,
  newLabels: Map<string, string>,
  override: boolean
) {
  if (!inputObject) {
    throw NullInputObjectError;
  }

  if (!inputObject.kind) {
    throw InputObjectKindNotDefinedError;
  }

  if (!newLabels) {
    return;
  }

  let existingLabels = getSpecLabels(inputObject);
  if (override) {
    existingLabels = newLabels;
  } else {
    existingLabels = existingLabels || new Map<string, string>();
    Object.keys(newLabels).forEach(
      (key) => (existingLabels[key] = newLabels[key])
    );
  }

  setSpecLabels(inputObject, existingLabels);
}

export function updateSelectorLabels(
  inputObject: any,
  newLabels: Map<string, string>,
  override: boolean
) {
  if (!inputObject) {
    throw NullInputObjectError;
  }

  if (!inputObject.kind) {
    throw InputObjectKindNotDefinedError;
  }

  if (!newLabels) {
    return;
  }

  if (inputObject.kind.toLowerCase() === KubernetesWorkload.POD.toLowerCase())
    return;

  let existingLabels = getSpecSelectorLabels(inputObject);
  if (override) {
    existingLabels = newLabels;
  } else {
    existingLabels = existingLabels || new Map<string, string>();
    Object.keys(newLabels).forEach(
      (key) => (existingLabels[key] = newLabels[key])
    );
  }

  setSpecSelectorLabels(inputObject, existingLabels);
}

export function getResources(
  filePaths: string[],
  filterResourceTypes: string[]
): Resource[] {
  if (!filePaths) {
    return [];
  }

  const resources: Resource[] = [];

  filePaths.forEach((filePath: string) => {
    const fileContents = fs.readFileSync(filePath);
    yaml.safeLoadAll(fileContents, (inputObject) => {
      const inputObjectKind = inputObject?.kind || "";
      if (
        filterResourceTypes.filter(
          (type) => inputObjectKind.toLowerCase() === type.toLowerCase()
        ).length > 0
      ) {
        resources.push({
          type: inputObject.kind,
          name: inputObject.metadata.name,
        });
      }
    });
  });

  return resources;
}

function getSpecLabels(inputObject: any) {
  if (!inputObject) return null;

  if (inputObject.kind.toLowerCase() === KubernetesWorkload.POD.toLowerCase())
    return inputObject.metadata.labels;

  if (inputObject?.spec?.template?.metadata)
    return inputObject.spec.template.metadata.labels;

  return null;
}

function getImagePullSecrets(inputObject: any) {
  if (!inputObject?.spec) return null;

  if (
    inputObject.kind.toLowerCase() === KubernetesWorkload.CRON_JOB.toLowerCase()
  )
    return inputObject?.spec?.jobTemplate?.spec?.template?.spec
      ?.imagePullSecrets;

  if (inputObject.kind.toLowerCase() === KubernetesWorkload.POD.toLowerCase())
    return inputObject.spec.imagePullSecrets;

  if (inputObject?.spec?.template?.spec) {
    return inputObject.spec.template.spec.imagePullSecrets;
  }

  return null;
}

function setImagePullSecrets(inputObject: any, newImagePullSecrets: any) {
  if (!inputObject || !inputObject.spec || !newImagePullSecrets) {
    return;
  }

  if (inputObject.kind.toLowerCase() === KubernetesWorkload.POD.toLowerCase()) {
    inputObject.spec.imagePullSecrets = newImagePullSecrets;
    return;
  }

  if (
    inputObject.kind.toLowerCase() === KubernetesWorkload.CRON_JOB.toLowerCase()
  ) {
    if (inputObject?.spec?.jobTemplate?.spec?.template?.spec)
      inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets =
        newImagePullSecrets;
    return;
  }

  if (inputObject?.spec?.template?.spec) {
    inputObject.spec.template.spec.imagePullSecrets = newImagePullSecrets;
    return;
  }
}

function setSpecLabels(inputObject: any, newLabels: any) {
  if (!inputObject || !newLabels) return null;

  if (inputObject.kind.toLowerCase() === KubernetesWorkload.POD.toLowerCase()) {
    inputObject.metadata.labels = newLabels;
    return;
  }

  if (inputObject?.spec?.template?.metatada) {
    inputObject.spec.template.metatada.labels = newLabels;
    return;
  }
}

function getSpecSelectorLabels(inputObject: any) {
  if (inputObject?.spec?.selector) {
    if (isServiceEntity(inputObject.kind)) return inputObject.spec.selector;
    else return inputObject.spec.selector.matchLabels;
  }
}

function setSpecSelectorLabels(inputObject: any, newLabels: any) {
  if (inputObject?.spec?.selector) {
    if (isServiceEntity(inputObject.kind)) {
      inputObject.spec.selector = newLabels;
    } else {
      inputObject.spec.selector.matchLabels = newLabels;
    }
  }
}
