import * as core from '@actions/core'
import {parseAnnotations} from './types/annotations'
import {
   ClusterType,
   ResourceTypeFleet,
   ResourceTypeManagedCluster
} from './actions/deploy'

export const inputAnnotations = parseAnnotations(
   core.getInput('annotations', {required: false})
)

export function getBufferTime(): number {
   const inputBufferTime = parseInt(
      core.getInput('version-switch-buffer') || '0'
   )
   if (inputBufferTime < 0 || inputBufferTime > 300)
      throw Error('Version switch buffer must be between 0 and 300 (inclusive)')

   return inputBufferTime
}

export function parseResourceTypeInput(rawInput: string): ClusterType {
   switch (rawInput.toLowerCase()) {
      case ResourceTypeFleet.toLowerCase():
         return ResourceTypeFleet
      case ResourceTypeManagedCluster.toLowerCase():
         return ResourceTypeManagedCluster
      default:
         let errMsg = `Invalid resource type: ${rawInput}. Supported resource types are: ${ResourceTypeManagedCluster} (default), ${ResourceTypeFleet}`
         throw new Error(errMsg)
   }
}
