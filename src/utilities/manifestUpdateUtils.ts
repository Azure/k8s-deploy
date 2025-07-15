import * as core from '@actions/core'
import * as fs from 'fs'
import * as yaml from 'js-yaml'
import * as path from 'path'
import * as fileHelper from './fileUtils'
import {moveFileToTmpDir} from './fileUtils'
import {
   InputObjectKindNotDefinedError,
   InputObjectMetadataNotDefinedError,
   isWorkloadEntity,
   KubernetesWorkload,
   NullInputObjectError
} from '../types/kubernetesTypes'
import {
   getSpecSelectorLabels,
   setSpecSelectorLabels
} from './manifestSpecLabelUtils'
import {
   getImagePullSecrets,
   setImagePullSecrets
} from './manifestPullSecretUtils'
import {Resource} from '../types/kubectl'
import {K8sObject} from '../types/k8sObject'

export function updateManifestFiles(manifestFilePaths: string[]) {
   if (manifestFilePaths?.length === 0) {
      throw new Error('Manifest files not provided')
   }

   // move original set of input files to tmp dir
   const manifestFilesInTempDir = moveFilesToTmpDir(manifestFilePaths)

   // update container images
   const containers: string[] = core.getInput('images').split('\n')

   const manifestFiles = updateContainerImagesInManifestFiles(
      manifestFilesInTempDir,
      containers
   )

   // update pull secrets
   const imagePullSecrets: string[] = core
      .getInput('imagepullsecrets')
      .split('\n')
      .filter((secret) => secret.trim().length > 0)
   return updateImagePullSecretsInManifestFiles(manifestFiles, imagePullSecrets)
}

export function moveFilesToTmpDir(filepaths: string[]): string[] {
   return filepaths.map((filename) => {
      return moveFileToTmpDir(filename)
   })
}

export function UnsetClusterSpecificDetails(resource: any) {
   if (!resource) {
      return
   }

   // Unset cluster specific details in the object
   if (!!resource) {
      const {metadata, status} = resource

      if (!!metadata) {
         resource.metadata = {
            annotations: metadata.annotations,
            labels: metadata.labels,
            name: metadata.name
         }
      }

      if (!!status) {
         resource.status = {}
      }
   }
}

function updateContainerImagesInManifestFiles(
   filePaths: string[],
   containers: string[]
): string[] {
   if (!filePaths?.length) return filePaths

   filePaths.forEach((filePath: string) => {
      const fileContents = fs.readFileSync(filePath, 'utf8')
      const inputObjects = yaml.loadAll(fileContents) as K8sObject[]

      const updatedObjects = inputObjects.map((obj) => {
         if (!isWorkloadEntity(obj.kind)) return obj

         containers.forEach((container: string) => {
            let [imageName] = container.split(':')
            if (imageName.includes('@')) {
               imageName = imageName.split('@')[0]
            }
            updateImagesInK8sObject(obj, imageName, container)
         })

         return obj
      })
      const newYaml = updatedObjects.map((o) => yaml.dump(o)).join('---\n')
      fs.writeFileSync(path.join(filePath), newYaml)
   })
   return filePaths
}

export function updateImagesInK8sObject(
   obj: any,
   imageName: string,
   newImage: string
) {
   const isCronJob = obj?.kind?.toLowerCase() === KubernetesWorkload.CRON_JOB

   const containerPaths = [
      // Regular workload
      obj?.spec?.template?.spec,
      // CronJob workload
      isCronJob ? obj?.spec?.jobTemplate?.spec?.template?.spec : null
   ].filter(Boolean) // Remove any undefined/null entries

   for (const path of containerPaths) {
      if (path?.containers) {
         updateImageInContainerArray(path.containers, imageName, newImage)
      }
      if (path?.initContainers) {
         updateImageInContainerArray(path.initContainers, imageName, newImage)
      }
   }
}

function updateImageInContainerArray(
   containers: any[],
   imageName: string,
   newImage: string
) {
   if (!Array.isArray(containers)) return
   containers.forEach((container) => {
      if (
         container.image &&
         (container.image === imageName ||
            container.image.startsWith(imageName + ':') ||
            container.image.startsWith(imageName + '@'))
      ) {
         container.image = newImage
      }
   })
}

export function getReplicaCount(inputObject: any): any {
   if (!inputObject) throw NullInputObjectError

   if (!inputObject.kind) {
      throw InputObjectKindNotDefinedError
   }

   const {kind} = inputObject
   if (
      kind.toLowerCase() !== KubernetesWorkload.POD.toLowerCase() &&
      kind.toLowerCase() !== KubernetesWorkload.DAEMON_SET.toLowerCase()
   )
      return inputObject.spec.replicas

   return 0
}

export function updateObjectLabels(
   inputObject: any,
   newLabels: Map<string, string>,
   override: boolean = false
) {
   if (!inputObject) throw NullInputObjectError

   if (!inputObject.metadata) throw InputObjectMetadataNotDefinedError

   if (!newLabels) return

   if (override) {
      inputObject.metadata.labels = newLabels
   } else {
      let existingLabels =
         inputObject.metadata.labels || new Map<string, string>()

      Object.keys(newLabels).forEach(
         (key) => (existingLabels[key] = newLabels[key])
      )

      inputObject.metadata.labels = existingLabels
   }
}

export function updateObjectAnnotations(
   inputObject: any,
   newAnnotations: Map<string, string>,
   override: boolean = false
) {
   if (!inputObject) throw NullInputObjectError

   if (!inputObject.metadata) throw InputObjectMetadataNotDefinedError

   if (!newAnnotations) return

   if (override) {
      inputObject.metadata.annotations = newAnnotations
   } else {
      const existingAnnotations =
         inputObject.metadata.annotations || new Map<string, string>()

      Object.keys(newAnnotations).forEach(
         (key) => (existingAnnotations[key] = newAnnotations[key])
      )

      inputObject.metadata.annotations = existingAnnotations
   }
}

export function updateImagePullSecrets(
   inputObject: any,
   newImagePullSecrets: string[],
   override: boolean = false
) {
   if (!inputObject?.spec || !newImagePullSecrets) return

   const newImagePullSecretsObjects = Array.from(
      newImagePullSecrets,
      (name) => {
         return {name}
      }
   )
   let existingImagePullSecretObjects: any = getImagePullSecrets(inputObject)

   if (override) {
      existingImagePullSecretObjects = newImagePullSecretsObjects
   } else {
      existingImagePullSecretObjects = existingImagePullSecretObjects || []

      existingImagePullSecretObjects = existingImagePullSecretObjects.concat(
         newImagePullSecretsObjects
      )
   }

   setImagePullSecrets(inputObject, existingImagePullSecretObjects)
}

export function updateSelectorLabels(
   inputObject: any,
   newLabels: Map<string, string>,
   override: boolean
) {
   if (!inputObject) throw NullInputObjectError

   if (!inputObject.kind) throw InputObjectKindNotDefinedError

   if (!newLabels) return

   if (inputObject.kind.toLowerCase() === KubernetesWorkload.POD.toLowerCase())
      return

   let existingLabels = getSpecSelectorLabels(inputObject)
   if (override) {
      existingLabels = newLabels
   } else {
      existingLabels = existingLabels || new Map<string, string>()
      Object.keys(newLabels).forEach(
         (key) => (existingLabels[key] = newLabels[key])
      )
   }

   setSpecSelectorLabels(inputObject, existingLabels)
}

export function getResources(
   filePaths: string[],
   filterResourceTypes: string[]
): Resource[] {
   if (!filePaths) return []

   const resources: Resource[] = []
   filePaths.forEach((filePath: string) => {
      try {
         const fileContents = fs.readFileSync(filePath).toString()
         const inputObjects: K8sObject[] = yaml.loadAll(
            fileContents
         ) as K8sObject[]
         inputObjects.forEach((inputObject) => {
            const inputObjectKind = inputObject?.kind || ''
            if (
               filterResourceTypes.filter(
                  (type) => inputObjectKind.toLowerCase() === type.toLowerCase()
               ).length > 0
            ) {
               resources.push({
                  type: inputObject.kind,
                  name: inputObject.metadata.name,
                  namespace: inputObject?.metadata?.namespace
               })
            }
         })
      } catch (error) {
         core.error(`Failed to process file at ${filePath}: ${error.message}`)
         throw error
      }
   })

   return resources
}

function updateImagePullSecretsInManifestFiles(
   filePaths: string[],
   imagePullSecrets: string[]
): string[] {
   if (imagePullSecrets?.length <= 0) return filePaths

   const newObjectsList = []
   filePaths.forEach((filePath: string) => {
      try {
         const fileContents = fs.readFileSync(filePath).toString()
         yaml.loadAll(fileContents, (inputObject: any) => {
            if (inputObject?.kind) {
               const {kind} = inputObject
               if (isWorkloadEntity(kind)) {
                  updateImagePullSecrets(inputObject, imagePullSecrets)
               }
               newObjectsList.push(inputObject)
            }
         })
      } catch (error) {
         core.error(`Failed to process file at ${filePath}: ${error.message}`)
         throw error
      }
   })

   return fileHelper.writeObjectsToFile(newObjectsList)
}
