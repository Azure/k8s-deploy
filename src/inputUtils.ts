import * as core from '@actions/core'
import {parseAnnotations} from './types/annotations'

export const inputAnnotations = parseAnnotations(
   core.getInput('annotations', {required: false})
)


export function getBufferTime(): number{
   const inputBufferTime = parseInt(core.getInput('version-switch-buffer') || '0')
   if (inputBufferTime < 0 || inputBufferTime > 300)
   throw Error('Version switch buffer must be between 0 and 300 (inclusive)')

   return inputBufferTime
}
