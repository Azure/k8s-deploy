import * as k8s from "@kubernetes/client-node";
import * as core from "@actions/core";

export enum Workload {
  DEPLOYMENT = "deployment",
  REPLICASET = "replicaset",
  DAEMONSET = "daemonset",
  POD = "pod",
  STATEFULSET = "statefulset",
  JOB = "job",
  CRONJJOB = "cronjob",
}

/**
 * Converts a string to the Workload enum
 * @param str The workload type (case insensitive)
 * @returns The Workload enum or undefined if it can't be parsed
 */
export const parseWorkload = (str: string): Workload | undefined =>
  Workload[
    Object.keys(Workload).filter(
      (k) => Workload[k].toString().toLowerCase() === str.toLowerCase()
    )[0] as keyof typeof Workload
  ];

export const isWorkload = (kind: string): boolean =>
  parseWorkload(kind) !== undefined;

export const setImagePullSecrets = (
  k: any,
  newSecrets: { name: string }[],
  override: boolean = false
) => {
  switch (parseWorkload(k.kind)) {
    case Workload.POD: {
      if (k && k.spec && k.spec.imagePullSecrets)
        k.spec.imagePullSecrets = getOverriddenSecrets(
          k.spec.imagePullSecrets,
          newSecrets,
          override
        );
      else throw ManifestSecretError;
      break;
    }
    case Workload.CRONJJOB: {
      if (
        k &&
        k.spec &&
        k.spec.jobTemplate &&
        k.spec.jobTemplate.spec &&
        k.spec.jobTemplate.spec.template &&
        k.spec.jobTemplate.spec.template.spec &&
        k.spec.jobTemplate.spec.template.spec.imagePullSecrets
      )
        k.spec.jobTemplate.spec.template.spec.imagePullSecrets =
          getOverriddenSecrets(
            k.spec.jobTemplate.spec.template.spec.imagePullSecrets,
            newSecrets,
            override
          );
      else throw ManifestSecretError;
      break;
    }
    case undefined: {
      core.debug(`Can't set secrets for manifests of kind ${k.kind}.`);
      break;
    }
    default: {
      if (k && k.spec && k.spec.template && k.spec.template.imagePullSecrets)
        k.spec.template.spec.imagePullSecrets = getOverriddenSecrets(
          k.spec.template.spec.imagePullSecrets,
          newSecrets,
          override
        );
      else throw ManifestSecretError;
      break;
    }
  }

  return k;
};

const getOverriddenSecrets = (oldSecrets, newSecrets, override) => {
  if (override) return newSecrets;

  return oldSecrets.concat(newSecrets);
};

const ManifestSecretError = Error(
  `Can't update secret of manifest due to improper format`
);
