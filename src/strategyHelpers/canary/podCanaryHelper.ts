import {Kubectl} from '../../types/kubectl'
import * as core from '@actions/core'
import * as fs from 'fs'
import * as yaml from 'js-yaml'

import * as fileHelper from '../../utilities/fileUtils'
import * as canaryDeploymentHelper from './canaryHelper'
import {isDeploymentEntity} from '../../types/kubernetesTypes'
import {getReplicaCount} from '../../utilities/manifestUpdateUtils'

export async function deployPodCanary(filePaths: string[], kubectl: Kubectl) {
   const newObjectsList = []
   const percentage = parseInt(core.getInput('percentage'))

   if (percentage < 0 || percentage > 100)
      throw Error('Percentage must be between 0 and 100')

   for (const filePath of filePaths) {
      const fileContents = fs.readFileSync(filePath).toString()
      const parsedYaml = yaml.safeLoadAll(fileContents)
      for (const inputObject of parsedYaml) {
         const name = inputObject.metadata.name
         const kind = inputObject.kind

         if (isDeploymentEntity(kind)) {
            core.debug('Calculating replica count for canary')
            const canaryReplicaCount = calculateReplicaCountForCanary(
               inputObject,
               percentage
            )
            core.debug('Replica count is ' + canaryReplicaCount)

            // Get stable object
            core.debug('Querying stable object')
            const stableObject = await canaryDeploymentHelper.fetchResource(
               kubectl,
               kind,
               name
            )

            if (!stableObject) {
               core.debug('Stable object not found. Creating canary object')
               const newCanaryObject =
                  canaryDeploymentHelper.getNewCanaryResource(
                     inputObject,
                     canaryReplicaCount
                  )
               newObjectsList.push(newCanaryObject)
            } else {
               core.debug(
                  'Creating canary and baseline objects. Stable object found: ' +
                     JSON.stringify(stableObject)
               )

               const newCanaryObject =
                  canaryDeploymentHelper.getNewCanaryResource(
                     inputObject,
                     canaryReplicaCount
                  )
               core.debug(
                  'New canary object: ' + JSON.stringify(newCanaryObject)
               )

               const newBaselineObject =
                  canaryDeploymentHelper.getNewBaselineResource(
                     stableObject,
                     canaryReplicaCount
                  )
               core.debug(
                  'New baseline object: ' + JSON.stringify(newBaselineObject)
               )

               newObjectsList.push(newCanaryObject)
               newObjectsList.push(newBaselineObject)
            }
         } else {
            // update non deployment entity as it is
            newObjectsList.push(inputObject)
         }
      }
   }

   core.debug('New objects list: ' + JSON.stringify(newObjectsList))
   const manifestFiles = fileHelper.writeObjectsToFile(newObjectsList)
   const forceDeployment = core.getInput('force').toLowerCase() === 'true'

   const result = await kubectl.apply(manifestFiles, forceDeployment)
   return {result, newFilePaths: manifestFiles}
}

function calculateReplicaCountForCanary(inputObject: any, percentage: number) {
   const inputReplicaCount = getReplicaCount(inputObject)
   return Math.round((inputReplicaCount * percentage) / 100)
}
