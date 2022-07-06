import {DeploymentConfig} from '../types/deploymentConfig'

const ANNOTATION_PREFIX = 'actions.github.com/'

export function prefixObjectKeys(obj: any, prefix: string): any {
   return Object.keys(obj).reduce((newObj, key) => {
      newObj[prefix + key] = obj[key]
      return newObj
   }, {})
}

export function getWorkflowAnnotations(
   lastSuccessRunSha: string,
   workflowFilePath: string,
   deploymentConfig: DeploymentConfig
): string {
   const annotationObject = {
      run: process.env.GITHUB_RUN_ID,
      repository: process.env.GITHUB_REPOSITORY,
      workflow: process.env.GITHUB_WORKFLOW,
      workflowFileName: workflowFilePath.replace('.github/workflows/', ''),
      jobName: process.env.GITHUB_JOB,
      createdBy: process.env.GITHUB_ACTOR,
      runUri: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
      commit: process.env.GITHUB_SHA,
      lastSuccessRunCommit: lastSuccessRunSha,
      branch: process.env.GITHUB_REF,
      deployTimestamp: Date.now(),
      dockerfilePaths: deploymentConfig.dockerfilePaths,
      manifestsPaths: deploymentConfig.manifestFilePaths,
      helmChartPaths: deploymentConfig.helmChartFilePaths,
      provider: 'GitHub'
   }
   const prefixedAnnotationObject = prefixObjectKeys(
      annotationObject,
      ANNOTATION_PREFIX
   )
   return JSON.stringify(prefixedAnnotationObject)
}

export function getWorkflowAnnotationKeyLabel(
   workflowFilePath: string
): string {
   const hashKey = require('crypto')
      .createHash('MD5')
      .update(`${process.env.GITHUB_REPOSITORY}/${workflowFilePath}`)
      .digest('hex')
   return `githubWorkflow_${hashKey}`
}

/**
 * Cleans label to match valid kubernetes label specification by removing invalid characters
 * @param label
 * @returns cleaned label
 */
export function cleanLabel(label: string): string {
   const removedInvalidChars = label.replace(/[^-A-Za-z0-9_.]/gi, '')
   const regex = /([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]/
   return regex.exec(removedInvalidChars)[0] || ''
}
