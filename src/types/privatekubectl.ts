import {Kubectl} from './kubectl'
import * as minimist from 'minimist'
import {ExecOptions, ExecOutput, getExecOutput} from '@actions/exec'
import * as core from '@actions/core'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'

export class PrivateKubectl extends Kubectl {
   protected async execute(args: string[], silent: boolean = false) {
      if (this.namespace) {
         args = args.concat(['--namespace', this.namespace])
      }
      args.unshift('kubectl')
      let kubectlCmd = args.join(' ')
      let addFileFlag = false
      let eo = <ExecOptions>{
         silent: true,
         failOnStdErr: false,
         ignoreReturnCode: true
      }

      if (this.containsFilenames(kubectlCmd)) {
         // For private clusters, files will referenced solely by their basename
         kubectlCmd = this.replaceFilnamesWithBasenames(kubectlCmd)
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
         const filenames = this.extractFilesnames(kubectlCmd).split(' ')

         const tempDirectory =
            process.env['runner.tempDirectory'] || os.tmpdir() + '/manifests'
         eo.cwd = tempDirectory
         privateClusterArgs.push(...['--file', '.'])

         let filenamesArr = filenames[0].split(',')
         for (let index = 0; index < filenamesArr.length; index++) {
            const file = filenamesArr[index]

            if (!file) {
               continue
            }
            this.moveFileToTempManifestDir(file)
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
      const runObj: {logs: string; exitCode: number} = JSON.parse(
         runOutput.stdout
      )
      if (!silent) core.info(runObj.logs)
      if (runOutput.exitCode !== 0 && runObj.exitCode !== 0) {
         throw Error(`failed private cluster Kubectl command: ${kubectlCmd}`)
      }

      return {
         exitCode: runObj.exitCode,
         stdout: runObj.logs,
         stderr: ''
      } as ExecOutput
   }

   private replaceFilnamesWithBasenames(kubectlCmd: string) {
      let exFilenames = this.extractFilesnames(kubectlCmd)
      let filenames = exFilenames.split(' ')
      let filenamesArr = filenames[0].split(',')

      for (let index = 0; index < filenamesArr.length; index++) {
         filenamesArr[index] = path.basename(filenamesArr[index])
      }

      let baseFilenames = filenamesArr.join()

      let result = kubectlCmd.replace(exFilenames, baseFilenames)
      return result
   }

   public extractFilesnames(strToParse: string) {
      const fileNames: string[] = []
      const argv = minimist(strToParse.split(' '))
      const fArg = 'f'
      const filenameArg = 'filename'

      fileNames.push(...this.extractFilesFromMinimist(argv, fArg))
      fileNames.push(...this.extractFilesFromMinimist(argv, filenameArg))

      return fileNames.join(' ')
   }

   private extractFilesFromMinimist(argv, arg: string): string[] {
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
