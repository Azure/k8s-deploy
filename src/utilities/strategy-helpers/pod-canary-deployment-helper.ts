"use strict";

import { Kubectl } from "../../types/kubectl";
import * as core from "@actions/core";
import * as fs from "fs";
import * as yaml from "js-yaml";

import * as TaskInputParameters from "../../input-parameters";
import * as fileHelper from "../files-helper";
import * as helper from "../resource-object-utility";
import * as canaryDeploymentHelper from "./canary-deployment-helper";

export async function deployPodCanary(filePaths: string[], kubectl: Kubectl) {
  const newObjectsList = [];
  const percentage = parseInt(TaskInputParameters.canaryPercentage);

  filePaths.forEach((filePath: string) => {
    const fileContents = fs.readFileSync(filePath);
    yaml.safeLoadAll(fileContents, function (inputObject) {
      const name = inputObject.metadata.name;
      const kind = inputObject.kind;
      if (helper.isDeploymentEntity(kind)) {
        core.debug("Calculating replica count for canary");
        const canaryReplicaCount = calculateReplicaCountForCanary(
          inputObject,
          percentage
        );
        core.debug("Replica count is " + canaryReplicaCount);

        // Get stable object
        core.debug("Querying stable object");
        const stableObject = canaryDeploymentHelper.fetchResource(
          kubectl,
          kind,
          name
        );
        if (!stableObject) {
          core.debug("Stable object not found. Creating only canary object");
          // If stable object not found, create canary deployment.
          const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(
            inputObject,
            canaryReplicaCount
          );
          core.debug(
            "New canary object is: " + JSON.stringify(newCanaryObject)
          );
          newObjectsList.push(newCanaryObject);
        } else {
          core.debug(
            "Stable object found. Creating canary and baseline objects"
          );
          // If canary object not found, create canary and baseline object.
          const newCanaryObject = canaryDeploymentHelper.getNewCanaryResource(
            inputObject,
            canaryReplicaCount
          );
          const newBaselineObject =
            canaryDeploymentHelper.getNewBaselineResource(
              stableObject,
              canaryReplicaCount
            );
          core.debug(
            "New canary object is: " + JSON.stringify(newCanaryObject)
          );
          core.debug(
            "New baseline object is: " + JSON.stringify(newBaselineObject)
          );
          newObjectsList.push(newCanaryObject);
          newObjectsList.push(newBaselineObject);
        }
      } else {
        // Updating non deployment entity as it is.
        newObjectsList.push(inputObject);
      }
    });
  });

  const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList);
  const result = await kubectl.apply(
    manifestFiles,
    TaskInputParameters.forceDeployment
  );
  return { result: result, newFilePaths: manifestFiles };
}

function calculateReplicaCountForCanary(inputObject: any, percentage: number) {
  const inputReplicaCount = helper.getReplicaCount(inputObject);
  return Math.round((inputReplicaCount * percentage) / 100);
}
