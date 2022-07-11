import {GitHubClient, OkStatusCode} from '../types/githubClient'
import * as core from '@actions/core'

export async function getWorkflowFilePath(
   githubToken: string
): Promise<string> {
   let workflowFilePath = process.env.GITHUB_WORKFLOW
   if (!workflowFilePath.startsWith('.github/workflows/')) {
      const githubClient = new GitHubClient(
         process.env.GITHUB_REPOSITORY,
         githubToken
      )
      const response = await githubClient.getWorkflows()
      if (response) {
         if (response.status === OkStatusCode && response.data.total_count) {
            if (response.data.total_count > 0) {
               for (const workflow of response.data.workflows) {
                  if (process.env.GITHUB_WORKFLOW === workflow.name) {
                     workflowFilePath = workflow.path
                     break
                  }
               }
            }
         } else if (response.status != OkStatusCode) {
            core.error(
               `An error occurred while getting list of workflows on the repo. Status code: ${response.status}`
            )
         }
      } else {
         core.error(`Failed to get response from workflow list API`)
      }
   }
   return Promise.resolve(workflowFilePath)
}

export function normalizeWorkflowStrLabel(workflowName: string): string {
   const workflowsPath = '.github/workflows/'
   workflowName = workflowName.startsWith(workflowsPath)
      ? workflowName.replace(workflowsPath, '')
      : workflowName
   return workflowName.replace(/ /g, '_')
}

export function getNormalizedPath(pathValue: string) {
   if (!isHttpUrl(pathValue)) {
      //if it is not an http url then convert to link from current repo and commit
      return `https://github.com/${process.env.GITHUB_REPOSITORY}/blob/${process.env.GITHUB_SHA}/${pathValue}`
   }
   return pathValue
}

export function isHttpUrl(url: string) {
   return /^https?:\/\/.*$/.test(url)
}
