import {Kubectl} from './kubectl'
import {ExecOptions, ExecOutput, getExecOutput} from '@actions/exec'
import * as core from '@actions/core'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'

export class PrivateKubectl extends Kubectl {
   protected async execute(args: string[], silent: boolean = false) {
      args.unshift('kubectl')
      let kubectlCmd = args.join(' ')
      let addFileFlag = false
      let eo = <ExecOptions>{silent}

      if (this.containsFilenames(kubectlCmd)) {
         // For private clusters, files will not be in the tmp directory
         //kubectlCmd = kubectlCmd.replace(/[\/][t][m][p][\/]/g, '')
         core.debug('kubectlcmd BEFORE: ' + kubectlCmd)
         // Instead of regex we want to use path.basename to remove the directories...
         kubectlCmd = this.replaceFilnamesWithBasenames(kubectlCmd)
         core.debug('kubectlcmd AFTER: ' + kubectlCmd)
         addFileFlag = true
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
         kubectlCmd
      ]

      if (addFileFlag) {
         const filenames = this.extractFilesnames(kubectlCmd).split(' ')

         // Find the range from start of files to end of files
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
      return await getExecOutput('az', privateClusterArgs, eo)
   }

   private replaceFilnamesWithBasenames(kubectlCmd: string) {
      let exFilenames = this.extractFilesnames(kubectlCmd)
      let filenames = exFilenames.split(' ')
      let filenamesArr = filenames[0].split(',')

      for (let index = 0; index < filenamesArr.length; index++) {
         filenamesArr[index] = path.basename(filenamesArr[index])
      }

      let baseFilenames = filenamesArr.join()

      let start = kubectlCmd.indexOf('-filename')
      let offset = 7

      if (start == -1) {
         start = kubectlCmd.indexOf('-f')

         if (start == -1) {
            return ''
         }
         offset = 0
      }

      let testResult = kubectlCmd.replace(exFilenames, baseFilenames)
      let startOfCommand = kubectlCmd.substring(0, start + offset)
      let endOfCommand = kubectlCmd.substring(start + offset)

      let result = startOfCommand + baseFilenames + endOfCommand
      core.debug('TEST: testResut: ' + testResult)

      return result

      // Replace the range of chars between start of filenames and end of it inside of kubectlCmd and return kubectlCmd
   }

   public extractFilesnames(strToParse: string) {
      let start = strToParse.indexOf('-filename')
      let offset = 7

      if (start == -1) {
         start = strToParse.indexOf('-f')

         if (start == -1) {
            return ''
         }
         offset = 0
      }

      let temp = strToParse.substring(start + offset)
      let end = temp.indexOf(' -')

      //End could be case where the -f flag was last, or -f is followed by some additonal flag and it's arguments
      return temp.substring(3, end == -1 ? temp.length : end).trim()
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
