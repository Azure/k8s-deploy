import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import * as os from "os";

export function getTempDirectory(): string {
  return process.env["runner.tempDirectory"] || os.tmpdir();
}

const userDirPathTopLevel = "kubectlTask";
export function getNewUserDirPath(): string {
  let userDir = path.join(getTempDirectory(), userDirPathTopLevel);
  ensureDirExists(userDir);

  userDir = path.join(userDir, getCurrentTime().toString());
  ensureDirExists(userDir);

  return userDir;
}

export function ensureDirExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }
}

export function assertFileExists(path: string) {
  if (!fs.existsSync(path)) {
    throw new Error(`File not found:  ${path}`);
  }
}

export function writeObjectsToFile(inputObjects: any[]): string[] {
  const newFilePaths = [];

  if (!!inputObjects) {
    inputObjects.forEach((inputObject: any) => {
      try {
        const inputObjectString = JSON.stringify(inputObject);

        if (inputObject?.metadata?.name) {
          const fileName = getManifestFileName(
            inputObject.kind,
            inputObject.metadata.name
          );
          fs.writeFileSync(path.join(fileName), inputObjectString);
          newFilePaths.push(fileName);
        } else {
          core.debug(
            "Input object is not proper K8s resource object. Object: " +
              inputObjectString
          );
        }
      } catch (ex) {
        core.debug(
          `Exception occurred while writing object to file ${inputObject}: ${ex}`
        );
      }
    });
  }

  return newFilePaths;
}

export function writeManifestToFile(
  inputObjectString: string,
  kind: string,
  name: string
): string {
  if (inputObjectString) {
    try {
      const fileName = getManifestFileName(kind, name);
      fs.writeFileSync(path.join(fileName), inputObjectString);
      return fileName;
    } catch (ex) {
      throw Error(
        `Exception occurred while writing object to file: ${inputObjectString}. Exception: ${ex}`
      );
    }
  }
}

function getManifestFileName(kind: string, name: string) {
  const filePath = `${kind}_${name}_ ${getCurrentTime().toString()}`;
  const tempDirectory = getTempDirectory();
  return path.join(tempDirectory, path.basename(filePath));
}

function getCurrentTime(): number {
  return new Date().getTime();
}
