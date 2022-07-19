import {Kubectl} from './kubectl'
import {ExecOptions, ExecOutput, getExecOutput} from '@actions/exec'
import * as core from '@actions/core'
import * as os from 'os'
import * as fs from 'fs'

export class PrivateKubectl extends Kubectl {
   protected async execute(args: string[], silent: boolean = false) {
      args.unshift('kubectl')
      let kubectlCmd = args.join(' ')
      let addFileFlag = false
      let eo = <ExecOptions>{silent}

      if (this.containsFilenames(kubectlCmd)) {
         // For private clusters, files will not be in the tmp directory
         kubectlCmd = kubectlCmd.replace(/[\/][t][m][p][\/]/g, '')
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
         const tempDirectory =
            process.env['runner.tempDirectory'] || os.tmpdir() + '/manifests'
         eo.cwd = tempDirectory
         core.debug('ExecOptions current working directory: ' + eo.cwd)
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

      var temp = strToParse.substring(start + offset)
      var end = temp.indexOf(' -')

      //End could be case where the -f flag was last, or -f is followed by some additonal flag and it's arguments
      return temp.substring(3, end == -1 ? temp.length : end).trim()
   }

   private containsFilenames(str: string) {
      return str.includes('-f ') || str.includes('filename ')
   }

   private createTempManifestsDirectory() {
      if (!fs.existsSync('/tmp/manifests')) {
         try {
            fs.mkdirSync('/tmp/manifests', {recursive: true})
         } catch (e) {
            core.debug(
               'could not create the directory: ' + '/tmp/manifests' + ': ' + e
            )
         }
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
