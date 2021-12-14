import * as core from "@actions/core";
import * as k8s from "@kubernetes/client-node";
import * as fs from "fs";
import * as os from "os";
import { getTempDirectory } from "../utilities";
import * as path from "path";
import * as yaml from "js-yaml";
import { isWorkload, setImagePullSecrets } from "../types/workload";

export async function deploy(
  manifestFilePaths: string[],
  deploymentStrategy: string
) {
  if (manifestFilePaths.length < 1) throw Error("No manifest files supplied");

  // get inputs
  const containers = core.getInput("images").split("\n");
  const pullSecrets = core
    .getInput("imagepullsecrets")
    .split("\n")
    .filter((secret) => secret.trim().length > 0)
    .map((secret) => {
      return { name: secret };
    });

  const newManifestFilePaths = [];

  // update manifest files with images and pull secrets
  const tempDirectory = getTempDirectory();
  manifestFilePaths.forEach((filePath: string) => {
    let manifest = fs.readFileSync(filePath).toString();

    // update manifest image
    containers.forEach((container) => {
      const imageName =
        container.indexOf("@") > 0
          ? container.split("@")[0]
          : container.split(":")[0];

      if (manifest.indexOf(imageName) > 0) {
        manifest = substituteImageName(manifest, imageName, container);
      }
    });

    // update image pull secrets
    const manifestObj = yaml.safeLoadAll(manifest);
    if (manifestObj?.kind && isWorkload(manifestObj.kind)) {
      manifest = JSON.stringify(setImagePullSecrets(manifestObj, pullSecrets));
    }

    // write updated manifest
    const newFilePath = path.join(tempDirectory, path.basename(filePath));
    fs.writeFileSync(newFilePath, manifest);
    newManifestFilePaths.push(newFilePath);
  });
}

export function substituteImageName(
  manifest: string,
  imageName: string,
  newImage: string
): string {
  return manifest.split("\n").reduce((acc, line) => {
    // iterate over file line by line
    const imageKey = line.match(/^ *image:/); // checks if line sets an image key
    if (imageKey) {
      let [currentImageName, currentImageTag] = line
        .substring(imageKey[0].length) // consume the line after the key
        .trim()
        .replace(/[',"]/g, "") // replace allowed quotes with nothing
        .split(":");

      if (!currentImageTag && currentImageName.indexOf(" ") > 0) {
        currentImageName = currentImageName.split(" ")[0]; // Strip off comments
      }

      // substitue the old line with the new line
      if (currentImageName === imageName) {
        return acc + `${imageKey[0]} ${newImage}\n`;
      }
    }

    return acc + line + "\n";
  }, "");
}
