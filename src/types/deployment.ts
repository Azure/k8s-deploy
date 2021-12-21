const deploymentTypes: string[] = [
  "deployment",
  "replicaset",
  "daemonset",
  "pod",
  "statefulset",
];

export const isDeployment = (kind: string): boolean =>
  deploymentTypes.some((x) => x == kind.toLowerCase());
