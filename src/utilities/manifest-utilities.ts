import * as core from "@actions/core";
import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import * as fileHelper from "./file-util";
import { getTempDirectory } from "./file-util";
import * as KubernetesObjectUtility from "./resource-object-utility";
import { createInlineArray } from "./utility";
import { KubernetesWorkload, WORKLOAD_TYPES } from "../types/kubernetes-types";

export function createKubectlArgs(
  kinds: Set<string>,
  names: Set<string>
): string {
  let args = "";

  if (kinds?.size > 0) {
    args += createInlineArray(Array.from(kinds.values()));
  }

  if (names?.size > 0) {
    args += " " + Array.from(names.values()).join(" ");
  }

  return args;
}

export function getDeleteCmdArgs(
  argsPrefix: string,
  inputArgs: string
): string {
  let args = "";

  if (argsPrefix?.length > 0) {
    args = argsPrefix;
  }

  if (inputArgs?.length > 0) {
    if (args.length > 0) {
      args += " ";
    }

    args += inputArgs;
  }

  return args;
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

function getImagePullSecrets(inputObject: any) {
  if (!inputObject?.spec) {
    return;
  }

  if (
    inputObject.kind === KubernetesWorkload.POD.toLowerCase() &&
    inputObject?.spec?.imagePullSecrets
  ) {
    return inputObject.spec.imagePullSecrets;
  } else if (
    inputObject.kind === KubernetesWorkload.CRON_JOB.toLowerCase() &&
    inputObject?.spec?.jobTemplate?.spec?.template?.spec?.imagePullSecrets
  ) {
    return inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets;
  } else if (inputObject?.spec?.template?.spec?.imagePullSecrets) {
    return inputObject.spec.template.spec.imagePullSecrets;
  }
}

function setImagePullSecrets(inputObject: any, newImagePullSecrets: any) {
  if (!inputObject?.spec || !newImagePullSecrets) {
    return;
  }

  if (inputObject.kind === KubernetesWorkload.POD.toLowerCase()) {
    if (newImagePullSecrets.length > 0)
      inputObject.spec.imagePullSecrets = newImagePullSecrets;
    else delete inputObject.spec.imagePullSecrets;
  } else if (inputObject.kind === KubernetesWorkload.CRON_JOB.toLowerCase()) {
    if (inputObject?.spec?.jobTemplate?.spec?.template?.spec) {
      if (newImagePullSecrets.length > 0)
        inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets =
          newImagePullSecrets;
      else
        delete inputObject.spec.jobTemplate.spec.template.spec.imagePullSecrets;
    }
  } else if (inputObject?.spec?.template?.spec) {
    if (inputObject?.spec?.template?.spec) {
      if (newImagePullSecrets.length > 0)
        inputObject.spec.template.spec.imagePullSecrets = newImagePullSecrets;
      else delete inputObject.spec.template.spec.imagePullSecrets;
    }
  }
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

export function updateImagePullSecrets(
  inputObject: any,
  newImagePullSecrets: string[]
) {
  if (!inputObject?.spec || !newImagePullSecrets) {
    return;
  }

  let newImagePullSecretsObjects;
  if (newImagePullSecrets.length > 0) {
    newImagePullSecretsObjects = Array.from(newImagePullSecrets, (x) => {
      return !!x ? { name: x } : null;
    });
  } else {
    newImagePullSecretsObjects = [];
  }

  let existingImagePullSecretObjects: any =
    getImagePullSecrets(inputObject) || new Array();
  existingImagePullSecretObjects = existingImagePullSecretObjects.concat(
    newImagePullSecretsObjects
  );
  setImagePullSecrets(inputObject, existingImagePullSecretObjects);
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

export function isWorkloadEntity(kind: string): boolean {
  if (!kind) {
    core.debug("Kind not defined");
    return false;
  }

  return WORKLOAD_TYPES.some((type: string) => {
    return type === kind;
  });
}

export function UnsetClusterSpecficDetails(resource: any) {
  if (!resource) {
    return;
  }

  // Unset cluster specific details in the object
  if (!!resource) {
    const { metadata, status } = resource;

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
