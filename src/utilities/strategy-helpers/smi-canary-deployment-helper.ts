import { Kubectl } from "../../types/kubectl";
import * as core from "@actions/core";
import * as fs from "fs";
import * as yaml from "js-yaml";

import * as TaskInputParameters from "../../input-parameters";
import * as fileHelper from "../files-helper";
import * as helper from "../resource-object-utility";
import * as utils from "../manifest-utilities";
import * as kubectlUtils from "../traffic-split-utility";
import * as canaryDeploymentHelper from "./canary-deployment-helper";
import { checkForErrors } from "../utility";

const TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX = "-workflow-rollout";
const TRAFFIC_SPLIT_OBJECT = "TrafficSplit";

export async function deploySMICanary(filePaths: string[], kubectl: Kubectl) {
  const canaryReplicaCount = parseInt(
    core.getInput("baseline-and-canary-replicas")
  );

  if (canaryReplicaCount < 0 || canaryReplicaCount > 100)
    throw Error("Baseline-and-canary-replicas must be between 0 and 100");

  const newObjectsList = [];
  filePaths.forEach((filePath: string) => {
    const fileContents = fs.readFileSync(filePath).toString();
    yaml.safeLoadAll(fileContents, (inputObject) => {
      const name = inputObject.metadata.name;
      const kind = inputObject.kind;

      if (helper.isDeploymentEntity(kind)) {
        const stableObject = canaryDeploymentHelper.fetchResource(
          kubectl,
          kind,
          name
        );

        if (!stableObject) {
          core.debug("Stable object not found. Creating only canary object");
          const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(
            inputObject,
            canaryReplicaCount
          );
          newObjectsList.push(newCanaryObject);
        } else {
          if (!canaryDeploymentHelper.isResourceMarkedAsStable(stableObject)) {
            throw Error(`StableSpecSelectorNotExist : ${name}`);
          }

          core.debug(
            "Stable object found. Creating canary and baseline objects"
          );
          const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(
            inputObject,
            canaryReplicaCount
          );
          const newBaselineObject =
            canaryDeploymentHelper.getNewBaselineResource(
              stableObject,
              canaryReplicaCount
            );
          newObjectsList.push(newCanaryObject);
          newObjectsList.push(newBaselineObject);
        }
      } else {
        // Update non deployment entity as it is
        newObjectsList.push(inputObject);
      }
    });
  });

  const newFilePaths = fileHelper.writeObjectsToFile(newObjectsList);
  const result = await kubectl.apply(
    newFilePaths,
    TaskInputParameters.forceDeployment
  );
  createCanaryService(kubectl, filePaths);
  return { result, newFilePaths };
}

async function createCanaryService(kubectl: Kubectl, filePaths: string[]) {
  const newObjectsList = [];
  const trafficObjectsList = [];

  filePaths.forEach((filePath: string) => {
    const fileContents = fs.readFileSync(filePath).toString();
    yaml.safeLoadAll(fileContents, async function (inputObject) {
      const name = inputObject.metadata.name;
      const kind = inputObject.kind;

      if (helper.isServiceEntity(kind)) {
        const newCanaryServiceObject =
          canaryDeploymentHelper.getNewCanaryResource(inputObject);
        newObjectsList.push(newCanaryServiceObject);

        const newBaselineServiceObject =
          canaryDeploymentHelper.getNewBaselineResource(inputObject);
        newObjectsList.push(newBaselineServiceObject);

        const stableObject = await canaryDeploymentHelper.fetchResource(
          kubectl,
          kind,
          canaryDeploymentHelper.getStableResourceName(name)
        );
        if (!stableObject) {
          const newStableServiceObject =
            canaryDeploymentHelper.getStableResource(inputObject);
          newObjectsList.push(newStableServiceObject);

          core.debug("Creating the traffic object for service: " + name);
          const trafficObject = createTrafficSplitManifestFile(
            kubectl,
            name,
            0,
            0,
            1000
          );

          trafficObjectsList.push(trafficObject);
        } else {
          let updateTrafficObject = true;
          const trafficObject = await canaryDeploymentHelper.fetchResource(
            kubectl,
            TRAFFIC_SPLIT_OBJECT,
            getTrafficSplitResourceName(name)
          );

          if (trafficObject) {
            const trafficJObject = JSON.parse(JSON.stringify(trafficObject));
            if (trafficJObject?.spec?.backends) {
              trafficJObject.spec.backends.forEach((s) => {
                if (
                  s.service ===
                    canaryDeploymentHelper.getCanaryResourceName(name) &&
                  s.weight === "1000m"
                ) {
                  core.debug("Update traffic objcet not required");
                  updateTrafficObject = false;
                }
              });
            }
          }

          if (updateTrafficObject) {
            core.debug(
              "Stable service object present so updating the traffic object for service: " +
                name
            );
            trafficObjectsList.push(updateTrafficSplitObject(kubectl, name));
          }
        }
      }
    });
  });

  const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
  manifestFiles.push(...trafficObjectsList);
  const result = await kubectl.apply(
    manifestFiles,
    TaskInputParameters.forceDeployment
  );
  checkForErrors([result]);
}

export function redirectTrafficToCanaryDeployment(
  kubectl: Kubectl,
  manifestFilePaths: string[]
) {
  adjustTraffic(kubectl, manifestFilePaths, 0, 1000);
}

export function redirectTrafficToStableDeployment(
  kubectl: Kubectl,
  manifestFilePaths: string[]
) {
  adjustTraffic(kubectl, manifestFilePaths, 1000, 0);
}

async function adjustTraffic(
  kubectl: Kubectl,
  manifestFilePaths: string[],
  stableWeight: number,
  canaryWeight: number
) {
  if (!manifestFilePaths || manifestFilePaths?.length == 0) {
    return;
  }

  const trafficSplitManifests = [];
  manifestFilePaths.forEach((filePath: string) => {
    const fileContents = fs.readFileSync(filePath).toString();
    yaml.safeLoadAll(fileContents, async (inputObject) => {
      const name = inputObject.metadata.name;
      const kind = inputObject.kind;

      if (helper.isServiceEntity(kind)) {
        trafficSplitManifests.push(
          await createTrafficSplitManifestFile(
            kubectl,
            name,
            stableWeight,
            0,
            canaryWeight
          )
        );
      }
    });
  });

  if (trafficSplitManifests.length <= 0) {
    return;
  }

  const result = await kubectl.apply(
    trafficSplitManifests,
    TaskInputParameters.forceDeployment
  );
  checkForErrors([result]);
}

async function updateTrafficSplitObject(
  kubectl: Kubectl,
  serviceName: string
): Promise<string> {
  const percentage = parseInt(core.getInput("percentage")) * 10;
  const baselineAndCanaryWeight = percentage / 2;
  const stableDeploymentWeight = 1000 - percentage;

  core.debug(
    "Creating the traffic object with canary weight: " +
      baselineAndCanaryWeight +
      ",baseling weight: " +
      baselineAndCanaryWeight +
      ",stable: " +
      stableDeploymentWeight
  );
  return await createTrafficSplitManifestFile(
    kubectl,
    serviceName,
    stableDeploymentWeight,
    baselineAndCanaryWeight,
    baselineAndCanaryWeight
  );
}

async function createTrafficSplitManifestFile(
  kubectl: Kubectl,
  serviceName: string,
  stableWeight: number,
  baselineWeight: number,
  canaryWeight: number
): Promise<string> {
  const smiObjectString = await getTrafficSplitObject(
    kubectl,
    serviceName,
    stableWeight,
    baselineWeight,
    canaryWeight
  );
  const manifestFile = fileHelper.writeManifestToFile(
    smiObjectString,
    TRAFFIC_SPLIT_OBJECT,
    serviceName
  );

  if (!manifestFile) {
    throw new Error("Unable to create traffic split manifest file");
  }

  return manifestFile;
}

let trafficSplitAPIVersion = "";
async function getTrafficSplitObject(
  kubectl: Kubectl,
  name: string,
  stableWeight: number,
  baselineWeight: number,
  canaryWeight: number
): Promise<string> {
  // cached version
  if (!trafficSplitAPIVersion) {
    trafficSplitAPIVersion = await kubectlUtils.getTrafficSplitAPIVersion(
      kubectl
    );
  }

  return JSON.stringify({
    apiVersion: trafficSplitAPIVersion,
    kind: "TrafficSplit",
    metadata: {
      name: getTrafficSplitResourceName(name),
    },
    spec: {
      backends: [
        {
          service: canaryDeploymentHelper.getStableResourceName(name),
          weight: stableWeight,
        },
        {
          service: canaryDeploymentHelper.getBaselineResourceName(name),
          weight: baselineWeight,
        },
        {
          service: canaryDeploymentHelper.getCanaryResourceName(name),
          weight: canaryWeight,
        },
      ],
      service: name,
    },
  });
}

function getTrafficSplitResourceName(name: string) {
  return name + TRAFFIC_SPLIT_OBJECT_NAME_SUFFIX;
}
