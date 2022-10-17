import * as fs from 'fs'
import * as https from 'https'
import * as path from 'path'
import * as core from '@actions/core'
import * as os from 'os'
import * as yaml from 'js-yaml'
import {Errorable, succeeded, failed, Failed} from '../types/errorable'
import {getCurrentTime} from './timeUtils'
import {isHttpUrl} from './githubUtils'
import {K8sObject} from '../types/k8sObject'

export const urlFileKind = 'urlfile'

export function getTempDirectory(): string {
   return process.env['runner.tempDirectory'] || os.tmpdir()
}

export function writeObjectsToFile(inputObjects: any[]): string[] {
   const newFilePaths = []

   inputObjects.forEach((inputObject: any) => {
      try {
         const inputObjectString = JSON.stringify(inputObject)

         if (inputObject?.metadata?.name) {
            const fileName = getManifestFileName(
               inputObject.kind,
               inputObject.metadata.name
            )
            fs.writeFileSync(path.join(fileName), inputObjectString)
            newFilePaths.push(fileName)
         } else {
            core.debug(
               'Input object is not proper K8s resource object. Object: ' +
                  inputObjectString
            )
         }
      } catch (ex) {
         core.debug(
            `Exception occurred while writing object to file ${inputObject}: ${ex}`
         )
      }
   })

   return newFilePaths
}

export function writeManifestToFile(
   inputObjectString: string,
   kind: string,
   name: string
): string {
   if (inputObjectString) {
      try {
         const fileName = getManifestFileName(kind, name)
         fs.writeFileSync(path.join(fileName), inputObjectString)
         return fileName
      } catch (ex) {
         throw Error(
            `Exception occurred while writing object to file: ${inputObjectString}. Exception: ${ex}`
         )
      }
   }
}

function getManifestFileName(kind: string, name: string) {
   const filePath = `${kind}_${name}_${getCurrentTime().toString()}`
   const tempDirectory = getTempDirectory()
   return path.join(tempDirectory, path.basename(filePath))
}

export async function getFilesFromDirectoriesAndURLs(
   filePaths: string[]
): Promise<string[]> {
   const fullPathSet: Set<string> = new Set<string>()

   let fileCounter = 0
   for (const fileName of filePaths) {
      try {
         if (isHttpUrl(fileName)) {
            try {
               const tempFilePath: string = await writeYamlFromURLToFile(
                  fileName,
                  fileCounter++
               )
               fullPathSet.add(tempFilePath)
            } catch (e) {
               throw Error(
                  `encountered error trying to pull YAML from URL ${fileName}: ${e}`
               )
            }
         } else if (fs.lstatSync(fileName).isDirectory()) {
            recurisveManifestGetter(fileName).forEach((file) => {
               fullPathSet.add(file)
            })
         } else if (
            getFileExtension(fileName) === 'yml' ||
            getFileExtension(fileName) === 'yaml'
         ) {
            fullPathSet.add(fileName)
         } else {
            core.debug(
               `Detected non-manifest file, ${fileName}, continuing... `
            )
         }
      } catch (ex) {
         throw Error(
            `Exception occurred while reading the file ${fileName}: ${ex}`
         )
      }
   }

   const arr = Array.from(fullPathSet)
   return arr
}

export async function writeYamlFromURLToFile(
   url: string,
   fileNumber: number
): Promise<string> {
   return new Promise((resolve, reject) => {
      https
         .get(url, async (response) => {
            const code = response.statusCode ?? 0
            if (code >= 400) {
               reject(
                  Error(
                     `received response status ${response.statusMessage} from url ${url}`
                  )
               )
            }

            const targetPath = getManifestFileName(
               urlFileKind,
               fileNumber.toString()
            )
            // save the file to disk
            const fileWriter = fs
               .createWriteStream(targetPath)
               .on('finish', () => {
                  const verification = verifyYaml(targetPath, url)
                  if (succeeded(verification)) {
                     core.debug(
                        `outputting YAML contents from ${url} to ${targetPath}: ${JSON.stringify(
                           verification.result
                        )}`
                     )
                     resolve(targetPath)
                  } else {
                     reject(verification.error)
                  }
               })

            response.pipe(fileWriter)
         })
         .on('error', (error) => {
            reject(error)
         })
   })
}

function verifyYaml(filepath: string, url: string): Errorable<K8sObject[]> {
   const fileContents = fs.readFileSync(filepath).toString()
   let inputObjects
   try {
      inputObjects = yaml.safeLoadAll(fileContents)
   } catch (e) {
      return {
         succeeded: false,
         error: `failed to parse manifest from url ${url}: ${e}`
      }
   }

   if (!inputObjects || inputObjects.length == 0) {
      return {
         succeeded: false,
         error: `failed to parse manifest from url ${url}: no objects detected in manifest`
      }
   }

   for (const obj of inputObjects) {
      if (!obj.kind || !obj.apiVersion || !obj.metadata) {
         return {
            succeeded: false,
            error: `failed to parse manifest from ${url}: missing fields`
         }
      }
   }

   return {succeeded: true, result: inputObjects}
}

function recurisveManifestGetter(dirName: string): string[] {
   const toRet: string[] = []

   fs.readdirSync(dirName).forEach((fileName) => {
      const fnwd: string = path.join(dirName, fileName)
      if (fs.lstatSync(fnwd).isDirectory()) {
         toRet.push(...recurisveManifestGetter(fnwd))
      } else if (
         getFileExtension(fileName) === 'yml' ||
         getFileExtension(fileName) === 'yaml'
      ) {
         toRet.push(path.join(dirName, fileName))
      } else {
         core.debug(`Detected non-manifest file, ${fileName}, continuing... `)
      }
   })

   return toRet
}

function getFileExtension(fileName: string) {
   return fileName.slice(((fileName.lastIndexOf('.') - 1) >>> 0) + 2)
}
