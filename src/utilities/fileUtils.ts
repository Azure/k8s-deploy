import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import * as os from "os";
import { getCurrentTime } from "./timeUtils";

export function getTempDirectory(): string {
  return process.env["runner.tempDirectory"] || os.tmpdir();
}

export function writeObjectsToFile(inputObjects: any[]): string[] {
  const newFilePaths = [];

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
  const filePath = `${kind}_${name}_${getCurrentTime().toString()}`;
  const tempDirectory = getTempDirectory();
  return path.join(tempDirectory, path.basename(filePath));
}

export function getFilesFromDirectories(
  filePaths: string[]
): string[]{

  const fullPathSet: Set<string> = new Set<string>()

  filePaths.forEach((fileName => {
      try {
          if(fs.lstatSync(fileName).isDirectory()){
              recurisveManifestGetter(fileName).forEach((file) => {fullPathSet.add(file)})
          } else if(getFileExtension(fileName) === "yml" || getFileExtension(fileName) === "yaml"){
              fullPathSet.add(fileName)
          } else{
              core.debug(`Detected non-manifest file, ${fileName}, continuing... ` )
          }
      } catch (ex) {
          throw Error(
           `Exception occurred while reading the file ${fileName}: ${ex}`
          );
      }
  }))

  return Array.from(fullPathSet)
}

function recurisveManifestGetter(dirName: string): string[]{
  const toRet: string[] = []

  fs.readdirSync(dirName).forEach((fileName) => {
      const fnwd: string = path.join(dirName, fileName)
      if(fs.lstatSync(fnwd).isDirectory()){
          toRet.push(...recurisveManifestGetter(fnwd))
      } else if(getFileExtension(fileName) === "yml" || getFileExtension(fileName) === "yaml"){
          toRet.push(path.join(dirName, fileName))
      } else{
          core.debug(`Detected non-manifest file, ${fileName}, continuing... ` )
      }
  })

  return toRet
}

function getFileExtension(fileName: string){
  return fileName.slice((fileName.lastIndexOf(".") - 1 >>> 0) + 2)
}