import {Kubectl} from '../../types/kubectl'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as yaml from 'js-yaml'

import * as fileHelper from '../../utilities/fileUtils'
import * as canaryDeploymentHelper from './canaryHelper'
import {isDeploymentEntity} from '../../types/kubernetesTypes'
import {getReplicaCount} from '../../utilities/manifestUpdateUtils'
import {DeployResult} from '../../types/deployResult'
import {K8sObject} from '../../types/k8sObject'

export async function deployPodCanary(
   filePaths: string[],
   kubectl: Kubectl,
   onlyDeployStable: boolean = false
): Promise<DeployResult> {
   const newObjectsList = []
   const percentage = parseInt(core.getInput('percentage', {required: true}))

   if (percentage < 0 || percentage > 100)
      throw Error('Percentage must be between 0 and 100')

   for (const filePath of filePaths) {
      try {
         const fileContents = fs.readFileSync(filePath, 'utf8')
         const parsedYaml = yaml.loadAll(fileContents)
         for (const inputObject of parsedYaml) {
            if (
               inputObject &&
               typeof inputObject === 'object' &&
               'metadata' in inputObject &&
               'kind' in inputObject &&
               'spec' in inputObject &&
               typeof inputObject.metadata === 'object' &&
               'name' in inputObject.metadata &&
               typeof inputObject.metadata.name === 'string' &&
               typeof inputObject.kind === 'string'
            ) {
               const obj = inputObject as K8sObject
               const name = obj.metadata.name
               const kind = obj.kind

               if (!onlyDeployStable && isDeploymentEntity(kind)) {
                  core.debug('Calculating replica count for canary')
                  const canaryReplicaCount = calculateReplicaCountForCanary(
                     obj,
                     percentage
                  )
                  core.debug('Replica count is ' + canaryReplicaCount)

                  const newCanaryObject =
                     canaryDeploymentHelper.getNewCanaryResource(
                        obj,
                        canaryReplicaCount
                     )
                  newObjectsList.push(newCanaryObject)

                  // if there's already a stable object, deploy baseline as well
                  const stableObject =
                     await canaryDeploymentHelper.fetchResource(
                        kubectl,
                        kind,
                        name
                     )
                  if (stableObject) {
                     core.debug(
                        `Stable object found for ${kind} ${name}. Creating baseline objects`
                     )
                     const newBaselineObject =
                        canaryDeploymentHelper.getNewBaselineResource(
                           stableObject,
                           canaryReplicaCount
                        )
                     core.debug(
                        'New baseline object: ' +
                           JSON.stringify(newBaselineObject)
                     )
                     newObjectsList.push(newBaselineObject)
                  }
               } else {
                  // deploy non deployment entity or regular deployments for promote as they are
                  newObjectsList.push(obj)
               }
            }
         }
      } catch (error) {
         core.error(
            `Failed to parse YAML file at ${filePath}: ${error.message}`
         )
         throw error
      }
   }

   core.debug('New objects list: ' + JSON.stringify(newObjectsList))
   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   const forceDeployment = core.getInput('force').toLowerCase() === 'true'
   const serverSideApply = core.getInput('server-side').toLowerCase() === 'true'

   const execResult = await kubectl.apply(
      manifestFiles,
      forceDeployment,
      serverSideApply
   )
   return {execResult, manifestFiles}
}

export function calculateReplicaCountForCanary(
   inputObject: any,
   percentage: number
) {
   const inputReplicaCount = getReplicaCount(inputObject)
   return Math.max(1, Math.round((inputReplicaCount * percentage) / 100))
}
