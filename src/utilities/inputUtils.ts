import * as core from '@actions/core'
import {parseAnnotations} from '../types/annotations'




 export function getInputAnnotations(): Map<string, string>{
    const annotations = parseAnnotations(
        core.getInput('annotations', {required: false})
     )

     return annotations
 }