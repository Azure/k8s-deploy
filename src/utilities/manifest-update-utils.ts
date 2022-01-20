import * as core from "@actions/core";
import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import * as fileHelper from "./file-utils";
import {getTempDirectory} from "./file-utils";
import * as KubernetesObjectUtility from "./resource-object-utility";

export function UnsetClusterSpecificDetails(resource: any) {
  if (!resource) {
    return;
  }

  // Unset cluster specific details in the object
  if (!!resource) {
    const { metadata, status } = resource;

    if (!!metadata) {
      resource.metadata = {
        annotations: metadata.annotations,
        labels: metadata.labels,
        name: metadata.name,
      };
    }

    if (!!status) {
      resource.status = {};
    }
  }
}

export function updateManifestFiles(manifestFilePaths: string[]) {
  if (manifestFilePaths?.length === 0) {
    throw new Error("Manifest files not provided");
  }

  // update container images
  const containers: string[] = core.getInput("images").split("\n");
  const manifestFiles = updateContainerImagesInManifestFiles(
      manifestFilePaths,
      containers
  );

  // update pull secrets
  const imagePullSecrets: string[] = core
      .getInput("imagepullsecrets")
      .split("\n")
      .filter((secret) => secret.trim().length > 0);
  return updateImagePullSecretsInManifestFiles(manifestFiles, imagePullSecrets);
}

function updateContainerImagesInManifestFiles(
  filePaths: string[],
  containers: string[]
): string[] {
  if (filePaths?.length <= 0) return filePaths;

  const newFilePaths = [];

  // update container images
  filePaths.forEach((filePath: string) => {
    let contents = fs.readFileSync(filePath).toString();

    containers.forEach((container: string) => {
      let [imageName] = container.split(":");
      if (imageName.indexOf("@") > 0) {
        imageName = imageName.split("@")[0];
      }

      if (contents.indexOf(imageName) > 0)
        contents = substituteImageNameInSpecFile(
          contents,
          imageName,
          container
        );
    });

    // write updated files
    const tempDirectory = getTempDirectory();
    const fileName = path.join(tempDirectory, path.basename(filePath));
    fs.writeFileSync(path.join(fileName), contents);
    newFilePaths.push(fileName);
  });

  return newFilePaths;
}

/*
  Example:

  Input of
    currentString: `image: "example/example-image"`
    imageName: `example/example-image`
    imageNameWithNewTag: `example/example-image:identifiertag`

  would return
    `image: "example/example-image:identifiertag"`
*/
export function substituteImageNameInSpecFile(
    spec: string,
    imageName: string,
    imageNameWithNewTag: string
) {
  if (spec.indexOf(imageName) < 0) return spec;

  return spec.split("\n").reduce((acc, line) => {
    const imageKeyword = line.match(/^ *image:/);
    if (imageKeyword) {
      let [currentImageName] = line
          .substring(imageKeyword[0].length) // consume the line from keyword onwards
          .trim()
          .replace(/[',"]/g, "") // replace allowed quotes with nothing
          .split(":");

      if (currentImageName?.indexOf(" ") > 0) {
        currentImageName = currentImageName.split(" ")[0]; // remove comments
      }

      if (currentImageName === imageName) {
        return acc + `${imageKeyword[0]} ${imageNameWithNewTag}\n`;
      }
    }

    return acc + line + "\n";
  }, "");
}

function updateImagePullSecretsInManifestFiles(
  filePaths: string[],
  imagePullSecrets: string[]
): string[] {
  if (imagePullSecrets?.length <= 0) return filePaths;

  const newObjectsList = [];
  filePaths.forEach((filePath: string) => {
    const fileContents = fs.readFileSync(filePath).toString();
    yaml.safeLoadAll(fileContents, (inputObject: any) => {
      if (inputObject?.kind) {
        const { kind } = inputObject;
        if (KubernetesObjectUtility.isWorkloadEntity(kind)) {
          KubernetesObjectUtility.updateImagePullSecrets(
            inputObject,
            imagePullSecrets
          );
        }
        newObjectsList.push(inputObject);
      }
    });
  });

  return fileHelper.writeObjectsToFile(newObjectsList);
}
