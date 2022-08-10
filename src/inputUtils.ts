import * as core from '@actions/core'
import {parseAnnotations} from './types/annotations'

export const inputAnnotations = parseAnnotations(
   core.getInput('annotations', {required: false})
)
export const inputBufferTime = parseInt(
   core.getInput('version-switch-buffer') || '0'
)
