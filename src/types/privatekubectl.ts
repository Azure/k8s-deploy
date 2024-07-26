import {Kubectl} from './kubectl'
import * as minimist from 'minimist'
import {ExecOptions, ExecOutput, getExecOutput} from '@actions/exec'
import * as core from '@actions/core'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import {getTempDirectory} from '../utilities/fileUtils'

export class PrivateKubectl extends Kubectl {
   protected async execute(args: string[], silent: boolean = false) {
      args.unshift('kubectl')
      let kubectlCmd = args.join(' ')
      let addFileFlag = false
      let eo = <ExecOptions>{
         silent: true,
         failOnStdErr: false,
         ignoreReturnCode: true
      }

      if (this.containsFilenames(kubectlCmd)) {
         kubectlCmd = replaceFileNamesWithNamesRelativeToTemp(kubectlCmd)
         addFileFlag = true
      }

      if (this.resourceGroup === '') {
         throw Error('Resource group must be specified for private cluster')
      }
      if (this.name === '') {
         throw Error('Cluster name must be specified for private cluster')
      }

      const privateClusterArgs = [
         'aks',
         'command',
         'invoke',
         '--resource-group',
         this.resourceGroup,
         '--name',
         this.name,
         '--command',
         `${kubectlCmd}`
      ]

      if (addFileFlag) {
         const filenames = extractFileNames(kubectlCmd)

         const tempDirectory = getTempDirectory()
         eo.cwd = tempDirectory
         privateClusterArgs.push(...['--file', '.'])

         for (const filename of filenames) {
            try {
               this.moveFileToTempManifestDir(filename)
            } catch (e) {
               core.debug(
                  `Error moving file ${filename} to temp directory: ${e}`
               )
            }
         }
      }

      core.debug(
         `private cluster Kubectl run with invoke command: ${kubectlCmd}`
      )

      const allArgs = [...privateClusterArgs, '-o', 'json']
      core.debug(`full form of az command: az ${allArgs.join(' ')}`)
      const runOutput = await getExecOutput('az', allArgs, eo)
      core.debug(
         `from kubectl private cluster command got run output ${JSON.stringify(
            runOutput
         )}`
      )

      if (runOutput.exitCode !== 0) {
         throw Error(
            `Call to private cluster failed. Command: '${kubectlCmd}', errormessage: ${runOutput.stderr}`
         )
      }

      const runObj: {logs: string; exitCode: number} = JSON.parse(
         runOutput.stdout
      )
      if (!silent) core.info(runObj.logs)
      if (runObj.exitCode !== 0) {
         throw Error(`failed private cluster Kubectl command: ${kubectlCmd}`)
      }

      return {
         exitCode: runObj.exitCode,
         stdout: runObj.logs,
         stderr: ''
      } as ExecOutput
   }

   private containsFilenames(str: string) {
      return str.includes('-f ') || str.includes('filename ')
   }

   private createTempManifestsDirectory() {
      const manifestsDir = '/tmp/manifests'
      if (!fs.existsSync('/tmp/manifests')) {
         fs.mkdirSync('/tmp/manifests', {recursive: true})
      }
   }

   private moveFileToTempManifestDir(file: string) {
      this.createTempManifestsDirectory()
      if (!fs.existsSync('/tmp/' + file)) {
         core.debug(
            '/tmp/' +
               file +
               ' does not exist, and therefore cannot be moved to the manifest directory'
         )
      }

      fs.copyFile('/tmp/' + file, '/tmp/manifests/' + file, function (err) {
         if (err) {
            core.debug(
               'Could not rename ' +
                  '/tmp/' +
                  file +
                  ' to  ' +
                  '/tmp/manifests/' +
                  file +
                  ' ERROR: ' +
                  err
            )
            return
         }
         core.debug(
            "Successfully moved file '" +
               file +
               "' from /tmp to /tmp/manifest directory"
         )
      })
   }
}

export function replaceFileNamesWithNamesRelativeToTemp(kubectlCmd: string) {
   let filenames = extractFileNames(kubectlCmd)
   let relativeNames = filenames.map((filename) =>
      path.relative(getTempDirectory(), filename)
   )

   let result = kubectlCmd
   if (filenames.length != relativeNames.length) {
      throw Error(
         'replacing filenames with relative from temp dir, ' +
            filenames.length +
            ' filenames != ' +
            relativeNames.length +
            'basenames'
      )
   }
   for (let index = 0; index < filenames.length; index++) {
      result = result.replace(filenames[index], relativeNames[index])
   }
   return result
}

export function extractFileNames(strToParse: string) {
   const fileNames: string[] = []
   const argv = minimist(strToParse.split(' '))
   const fArg = 'f'
   const filenameArg = 'filename'

   fileNames.push(...extractFilesFromMinimist(argv, fArg))
   fileNames.push(...extractFilesFromMinimist(argv, filenameArg))

   return fileNames
}

export function extractFilesFromMinimist(argv, arg: string): string[] {
   if (!argv[arg]) {
      return []
   }
   const toReturn: string[] = []
   if (typeof argv[arg] === 'string') {
      toReturn.push(...argv[arg].split(','))
   } else {
      for (const value of argv[arg] as string[]) {
         toReturn.push(...value.split(','))
      }
   }

   return toReturn
}
