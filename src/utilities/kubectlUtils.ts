import * as core from '@actions/core'
import {ExecOutput} from '@actions/exec'
import {Kubectl} from '../types/kubectl'

export function checkForErrors(
   execResults: ExecOutput[],
   warnIfError?: boolean
) {
   let stderr = ''
   execResults.forEach((result) => {
      if (result?.exitCode !== 0) {
         stderr += result?.stderr + ' \n'
      } else if (result?.stderr) {
         core.warning(result.stderr)
      }
   })

   if (stderr.length > 0) {
      if (warnIfError) {
         core.warning(stderr.trim())
      } else {
         throw new Error(stderr.trim())
      }
   }
}

export async function getLastSuccessfulRunSha(
   kubectl: Kubectl,
   namespaceName: string,
   annotationKey: string
): Promise<string> {
   try {
      const result = await kubectl.getResource('namespace', namespaceName)
      if (result?.stderr) {
         core.warning(result.stderr)
         return process.env.GITHUB_SHA
      } else if (result?.stdout) {
         const annotationsSet = JSON.parse(result.stdout).metadata.annotations
         if (annotationsSet && annotationsSet[annotationKey]) {
            return JSON.parse(annotationsSet[annotationKey].replace(/'/g, '"'))
               .commit
         } else {
            return 'NA'
         }
      }
   } catch (ex) {
      core.warning(`Failed to get commits from cluster. ${JSON.stringify(ex)}`)
      return ''
   }
}

export async function annotateChildPods(
   kubectl: Kubectl,
   resourceType: string,
   resourceName: string,
   annotationKeyValStr: string,
   allPods
): Promise<ExecOutput[]> {
   let owner = resourceName
   if (resourceType.toLowerCase().indexOf('deployment') > -1) {
      owner = await kubectl.getNewReplicaSet(resourceName)
   }

   const commandExecutionResults = []
   if (allPods?.items && allPods.items?.length > 0) {
      allPods.items.forEach((pod) => {
         const owners = pod?.metadata?.ownerReferences
         if (owners) {
            for (const ownerRef of owners) {
               if (ownerRef.name === owner) {
                  commandExecutionResults.push(
                     kubectl.annotate(
                        'pod',
                        pod.metadata.name,
                        annotationKeyValStr
                     )
                  )
                  break
               }
            }
         }
      })
   }

   return await Promise.all(commandExecutionResults)
}
