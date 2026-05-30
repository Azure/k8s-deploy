import fs from 'node:fs'
import * as https from 'https'
import * as path from 'path'
import * as core from '@actions/core'
import * as os from 'os'
import * as yaml from 'js-yaml'
import {Errorable, succeeded, failed, Failed} from '../types/errorable.js'
import {getCurrentTime} from './timeUtils.js'
import {isHttpUrl} from './githubUtils.js'
import {K8sObject} from '../types/k8sObject.js'

export const urlFileKind = 'urlfile'

let moveCounter = 0

export function getTempDirectory(): string {
   return process.env['RUNNER_TEMP'] || os.tmpdir()
}

// Exported for tests. Validates that `inputPath` resolves (after symlink
// resolution) to a location inside GITHUB_WORKSPACE. When GITHUB_WORKSPACE
// is not set (e.g. local dev / unit tests), the check is skipped — callers
// that write to RUNNER_TEMP still get protection from basename-only
// destinations.
export function assertPathWithinWorkspace(inputPath: string): string {
   const workspace = process.env.GITHUB_WORKSPACE
   if (!workspace) {
      core.warning(
         'GITHUB_WORKSPACE is not set; skipping manifest path containment check'
      )
      return inputPath
   }
   const resolvedWorkspace = fs.realpathSync(path.resolve(workspace))
   let resolvedInput: string
   try {
      resolvedInput = fs.realpathSync(path.resolve(inputPath))
   } catch (e) {
      throw new Error(
         `manifest path ${inputPath} does not exist or is not readable: ${e}`
      )
   }
   const rel = path.relative(resolvedWorkspace, resolvedInput)
   if (
      rel === '' ||
      (rel !== '..' &&
         !rel.startsWith('..' + path.sep) &&
         !path.isAbsolute(rel))
   ) {
      return resolvedInput
   }
   throw new Error(
      `manifest path ${inputPath} resolves to ${resolvedInput}, ` +
         `which is outside the workspace ${resolvedWorkspace}`
   )
}

export function writeObjectsToFile(inputObjects: any[]): string[] {
   const newFilePaths = []

   inputObjects.forEach((inputObject: any) => {
      try {
         const inputObjectString = JSON.stringify(inputObject)

         if (inputObject?.metadata?.name) {
            const fileName = getNewTempManifestFileName(
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
         const fileName = getNewTempManifestFileName(kind, name)
         fs.writeFileSync(path.join(fileName), inputObjectString)
         return fileName
      } catch (ex) {
         throw Error(
            `Exception occurred while writing object to file: ${inputObjectString}. Exception: ${ex}`
         )
      }
   }
}

export function moveFileToTmpDir(originalFilepath: string) {
   const safeSource = assertPathWithinWorkspace(originalFilepath)
   const tempDirectory = getTempDirectory()
   const ext = path.extname(safeSource)
   const base = path.basename(safeSource, ext)
   const uniqueName = `${base}_${getCurrentTime()}_${moveCounter++}${ext}`
   const newPath = path.join(tempDirectory, uniqueName)

   core.debug(`reading original contents from path: ${originalFilepath}`)
   const contents = fs.readFileSync(safeSource)

   core.debug(`writing contents to new path ${newPath}`)
   fs.writeFileSync(newPath, contents)

   core.debug(`moved contents from ${originalFilepath} to ${newPath}`)
   return newPath
}

function getNewTempManifestFileName(kind: string, name: string) {
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
            continue
         }

         const safePath = assertPathWithinWorkspace(fileName)

         if (fs.lstatSync(safePath).isDirectory()) {
            recurisveManifestGetter(safePath).forEach((file) => {
               fullPathSet.add(file)
            })
         } else if (
            getFileExtension(safePath) === 'yml' ||
            getFileExtension(safePath) === 'yaml'
         ) {
            fullPathSet.add(safePath)
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
         .get(url, (response) => {
            const code = response.statusCode ?? 0
            if (code >= 400) {
               response.resume()
               reject(
                  new Error(
                     `received response status ${response.statusMessage} from url ${url}`
                  )
               )
               return
            }

            const targetPath = getNewTempManifestFileName(
               urlFileKind,
               fileNumber.toString()
            )
            const fileWriter = fs.createWriteStream(targetPath)
            fileWriter.on('error', reject)
            fileWriter.on('finish', () => {
               try {
                  const verification = verifyYaml(targetPath, url)
                  if (succeeded(verification)) {
                     core.debug(
                        `outputting YAML contents from ${url} to ${targetPath}: ${JSON.stringify(
                           verification.result
                        )}`
                     )
                     resolve(targetPath)
                  } else {
                     reject(new Error(verification.error))
                  }
               } catch (e) {
                  reject(e)
               }
            })
            response.on('error', reject)
            response.pipe(fileWriter)
         })
         .on('error', reject)
   })
}

function verifyYaml(filepath: string, url: string): Errorable<K8sObject[]> {
   const fileContents = fs.readFileSync(filepath).toString()
   let inputObjects
   try {
      inputObjects = yaml.loadAll(fileContents)
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
      if (obj == null || !obj.kind || !obj.apiVersion || !obj.metadata) {
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
         toRet.push(assertPathWithinWorkspace(fnwd))
      } else {
         core.debug(`Detected non-manifest file, ${fileName}, continuing... `)
      }
   })

   return toRet
}

function getFileExtension(fileName: string) {
   return fileName.slice(((fileName.lastIndexOf('.') - 1) >>> 0) + 2)
}
