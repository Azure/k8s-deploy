import {Kubectl} from './kubectl.js'
import {ExecOptions, ExecOutput, getExecOutput} from '@actions/exec'
import * as core from '@actions/core'
import fs from 'node:fs'
import * as path from 'path'
import {getTempDirectory} from '../utilities/fileUtils.js'

const FILENAME_FLAGS = ['-f', '--filename']

/**
 * POSIX single-quote escaping.
 *
 * `az aks command invoke --command <string>` is evaluated by a shell inside
 * the cluster, so any value we interpolate must be quoted. Wrapping in single
 * quotes removes the special meaning of every character except `'`, which is
 * encoded as `'\''`.
 */
export function shellQuote(arg: string): string {
   const value = String(arg)
   if (value === '') return "''"
   // Unreserved characters are emitted bare to keep logged commands readable.
   if (/^[a-zA-Z0-9_@%+=:,./-]+$/.test(value)) return value
   return `'${value.split("'").join(`'\\''`)}'`
}

/** Joins an argv array into a string that is safe for a POSIX shell. */
export function buildShellCommand(args: string[]): string {
   return args.map(shellQuote).join(' ')
}

export class PrivateKubectl extends Kubectl {
   protected async execute(args: string[], silent: boolean = false) {
      let kubectlArgs = ['kubectl', ...args]
      let addFileFlag = false
      let eo = <ExecOptions>{
         silent: true,
         failOnStdErr: false,
         ignoreReturnCode: true
      }

      if (containsFilenames(kubectlArgs)) {
         kubectlArgs =
            replaceFileNamesWithShallowNamesRelativeToTemp(kubectlArgs)
         addFileFlag = true
      }

      if (this.resourceGroup === '') {
         throw Error('Resource group must be specified for private cluster')
      }
      if (this.name === '') {
         throw Error('Cluster name must be specified for private cluster')
      }

      // Every argument is quoted so that no manifest-derived value (resource
      // name, namespace, annotation payload, file path) can break out of its
      // argument and be interpreted as shell syntax by the in-cluster shell.
      // Do not replace this with a plain join.
      const kubectlCmd = buildShellCommand(kubectlArgs)

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
         const tempDirectory = getTempDirectory()
         eo.cwd = path.join(tempDirectory, 'manifests')
         privateClusterArgs.push(...['--file', '.'])
      }

      core.debug(
         `private cluster Kubectl run with invoke command: ${kubectlCmd}`
      )

      const allArgs = [...privateClusterArgs, '-o', 'json']
      const runOutput = await getExecOutput('az', allArgs, eo)

      if (runOutput.exitCode !== 0) {
         throw Error(
            `Call to private cluster failed. Command: '${kubectlCmd}', errormessage: ${runOutput.stderr}`
         )
      }

      const runObj: {logs: string; exitCode: number} = JSON.parse(
         runOutput.stdout
      )
      // Honour the caller's `silent` request. Callers pass silent=true for
      // commands whose output may contain pod specs and other sensitive
      // material; that output was previously written to the debug log
      // unconditionally regardless of `silent`.
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
}

function createTempManifestsDirectory(): string {
   const manifestsDirPath = path.join(getTempDirectory(), 'manifests')
   if (!fs.existsSync(manifestsDirPath)) {
      fs.mkdirSync(manifestsDirPath, {recursive: true})
   }

   return manifestsDirPath
}

/**
 * True when the argv contains a filename flag. Operates on discrete argv
 * elements rather than a substring search over a flattened command, so a
 * resource name or annotation value that merely contains "-f " cannot
 * trigger a false positive.
 */
export function containsFilenames(args: string[]): boolean {
   return args.some(
      (arg, i) =>
         (FILENAME_FLAGS.includes(arg) && i < args.length - 1) ||
         FILENAME_FLAGS.some((flag) => arg.startsWith(`${flag}=`))
   )
}

function copyToShallowName(filename: string): string {
   const relativeName = path.relative(getTempDirectory(), filename)
   const shallowName = path.basename(relativeName.split(path.sep).join('-'))

   const manifestsTempDir = createTempManifestsDirectory()
   const shallowPath = path.join(manifestsTempDir, shallowName)

   core.debug(
      `moving contents from ${filename} to shallow location at ${shallowPath}`
   )
   fs.writeFileSync(shallowPath, fs.readFileSync(filename).toString())

   return shallowName
}

/**
 * Rewrites the values of any `-f`/`--filename` arguments so they refer to
 * flattened copies inside RUNNER_TEMP/manifests, which is what gets uploaded
 * by `az aks command invoke --file .`.
 *
 * This works positionally on the argv array. The previous implementation
 * re-parsed a flattened command string with minimist and substituted paths
 * with String.replace, which mis-parsed any value containing spaces and could
 * corrupt unrelated arguments. Doing this before the join is also what makes
 * quoting possible at all.
 */
export function replaceFileNamesWithShallowNamesRelativeToTemp(
   args: string[]
): string[] {
   const result = [...args]

   for (let i = 0; i < result.length; i++) {
      const arg = result[i]

      if (FILENAME_FLAGS.includes(arg) && i < result.length - 1) {
         result[i + 1] = result[i + 1]
            .split(',')
            .map(copyToShallowName)
            .join(',')
         i++
         continue
      }

      const inlineFlag = FILENAME_FLAGS.find((flag) =>
         arg.startsWith(`${flag}=`)
      )
      if (inlineFlag) {
         const value = arg.slice(inlineFlag.length + 1)
         result[i] =
            `${inlineFlag}=${value.split(',').map(copyToShallowName).join(',')}`
      }
   }

   return result
}

/** Returns every filename referenced by `-f`/`--filename` in an argv array. */
export function extractFileNames(args: string[]): string[] {
   const fileNames: string[] = []

   for (let i = 0; i < args.length; i++) {
      const arg = args[i]

      if (FILENAME_FLAGS.includes(arg) && i < args.length - 1) {
         fileNames.push(...args[i + 1].split(','))
         i++
         continue
      }

      const inlineFlag = FILENAME_FLAGS.find((flag) =>
         arg.startsWith(`${flag}=`)
      )
      if (inlineFlag) {
         fileNames.push(...arg.slice(inlineFlag.length + 1).split(','))
      }
   }

   return fileNames
}
