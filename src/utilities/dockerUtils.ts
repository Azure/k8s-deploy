import * as io from '@actions/io'
import {DeploymentConfig} from '../types/deploymentConfig'
import * as core from '@actions/core'
import {DockerExec} from '../types/docker'
import {getNormalizedPath} from './githubUtils'

export async function getDeploymentConfig(): Promise<DeploymentConfig> {
   let helmChartPaths: string[] =
      process.env?.HELM_CHART_PATHS?.split(';').filter((path) => path != '') ||
      []
   helmChartPaths = helmChartPaths.map((helmchart) =>
      getNormalizedPath(helmchart.trim())
   )

   let inputManifestFiles: string[] =
      core
         .getInput('manifests')
         .split(/[\n,;]+/)
         .filter((manifest) => manifest.trim().length > 0) || []
   if (helmChartPaths?.length == 0) {
      inputManifestFiles = inputManifestFiles.map((manifestFile) =>
         getNormalizedPath(manifestFile)
      )
   }

   const imageNames = core.getInput('images').split('\n') || []
   const imageDockerfilePathMap: {[id: string]: string} = {}

   const pullImages = !(core.getInput('pull-images').toLowerCase() === 'false')
   if (pullImages) {
      //Fetching from image label if available
      for (const image of imageNames) {
         try {
            imageDockerfilePathMap[image] = await getDockerfilePath(image)
         } catch (ex) {
            core.warning(
               `Failed to get dockerfile path for image ${image.toString()}: ${ex} `
            )
         }
      }
   }

   return Promise.resolve(<DeploymentConfig>{
      manifestFilePaths: inputManifestFiles,
      helmChartFilePaths: helmChartPaths,
      dockerfilePaths: imageDockerfilePathMap
   })
}

async function getDockerfilePath(image: any): Promise<string> {
   await checkDockerPath()
   const dockerExec: DockerExec = new DockerExec('docker')
   await dockerExec.pull(image, [], false)

   const imageInspectResult: string = await dockerExec.inspect(image, [], false)
   const imageConfig = JSON.parse(imageInspectResult)[0]
   const DOCKERFILE_PATH_LABEL_KEY = 'dockerfile-path'

   let pathValue: string = ''
   if (
      imageConfig?.Config?.Labels &&
      imageConfig?.Config?.Labels[DOCKERFILE_PATH_LABEL_KEY]
   ) {
      const pathLabel = imageConfig.Config.Labels[DOCKERFILE_PATH_LABEL_KEY]
      pathValue = getNormalizedPath(pathLabel)
   }
   return Promise.resolve(pathValue)
}

export async function checkDockerPath() {
   const dockerPath = await io.which('docker', false)
   if (!dockerPath) {
      throw new Error('Docker is not installed.')
   }
}
