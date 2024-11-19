import {ExecOutput, getExecOutput} from '@actions/exec'
import {createInlineArray} from '../utilities/arrayUtils'
import * as core from '@actions/core'
import * as toolCache from '@actions/tool-cache'
import * as io from '@actions/io'

export interface Resource {
   name: string
   type: string
   namespace?: string
}

export class Kubectl {
   protected readonly kubectlPath: string
   protected readonly namespace: string
   protected readonly ignoreSSLErrors: boolean
   protected readonly resourceGroup: string
   protected readonly name: string
   protected isPrivateCluster: boolean

   constructor(
      kubectlPath: string,
      namespace: string = '',
      ignoreSSLErrors: boolean = false,
      resourceGroup: string = '',
      name: string = ''
   ) {
      this.kubectlPath = kubectlPath
      this.ignoreSSLErrors = !!ignoreSSLErrors
      this.namespace = namespace
      this.resourceGroup = resourceGroup
      this.name = name
   }

   public async apply(
      configurationPaths: string | string[],
      force: boolean = false
   ): Promise<ExecOutput> {
      try {
         if (!configurationPaths || configurationPaths?.length === 0)
            throw Error('Configuration paths must exist')

         const applyArgs: string[] = [
            'apply',
            '-f',
            createInlineArray(configurationPaths)
         ]
         if (force) applyArgs.push('--force')

         return await this.execute(applyArgs.concat(this.getFlags()))
      } catch (err) {
         core.debug('Kubectl apply failed:' + err)
      }
   }

   public async describe(
      resourceType: string,
      resourceName: string,
      silent: boolean = false,
      namespace?: string
   ): Promise<ExecOutput> {
      return await this.execute(
         ['describe', resourceType, resourceName].concat(
            this.getFlags(namespace)
         ),
         silent
      )
   }

   public async getNewReplicaSet(deployment: string, namespace?: string) {
      const result = await this.describe(
         'deployment',
         deployment,
         true,
         namespace
      )

      let newReplicaSet = ''
      if (result?.stdout) {
         const stdout = result.stdout.split('\n')
         core.debug('stdout from getNewReplicaSet is ' + JSON.stringify(stdout))
         stdout.forEach((line: string) => {
            const newreplicaset = 'newreplicaset'
            if (line && line.toLowerCase().indexOf(newreplicaset) > -1) {
               core.debug(
                  `found string of interest for replicaset, line is ${line}`
               )
               core.debug(
                  `substring is ${line.substring(newreplicaset.length).trim()}`
               )
               newReplicaSet = line
                  .substring(newreplicaset.length)
                  .trim()
                  .split(' ')[0]
            }
         })
      }

      return newReplicaSet
   }

   public async annotate(
      resourceType: string,
      resourceName: string,
      annotation: string,
      namespace?: string
   ): Promise<ExecOutput> {
      const args = [
         'annotate',
         resourceType,
         resourceName,
         annotation,
         '--overwrite'
      ].concat(this.getFlags(namespace))
      return await this.execute(args)
   }

   public async annotateFiles(
      files: string | string[],
      annotation: string,
      namespace?: string
   ): Promise<ExecOutput> {
      const filesToAnnotate = createInlineArray(files)
      core.debug(`annotating ${filesToAnnotate} with annotation ${annotation}`)
      const args = [
         'annotate',
         '-f',
         filesToAnnotate,
         annotation,
         '--overwrite'
      ].concat(this.getFlags(namespace))
      return await this.execute(args)
   }

   public async labelFiles(
      files: string | string[],
      labels: string[],
      namespace?: string
   ): Promise<ExecOutput> {
      const args = [
         'label',
         '-f',
         createInlineArray(files),
         ...labels,
         '--overwrite'
      ].concat(this.getFlags(namespace))
      return await this.execute(args)
   }

   public async getAllPods(): Promise<ExecOutput> {
      return await this.execute(
         ['get', 'pods', '-o', 'json'].concat(this.getFlags()),
         true
      )
   }

   public async checkRolloutStatus(
      resourceType: string,
      name: string,
      namespace?: string,
      timeout?: string
   ): Promise<ExecOutput> {
      const command = ['rollout', 'status', `${resourceType}/${name}`].concat(
         this.getFlags(namespace)
      )
      if (timeout) {
         command.push(`--timeout=${timeout}`)
      }
      return await this.execute(command)
   }

   public async getResource(
      resourceType: string,
      name: string,
      silentFailure: boolean = false,
      namespace?: string
   ): Promise<ExecOutput> {
      core.debug(
         'fetching resource of type ' + resourceType + ' and name ' + name
      )
      return await this.execute(
         ['get', `${resourceType}/${name}`, '-o', 'json'].concat(
            this.getFlags(namespace)
         ),
         silentFailure
      )
   }

   public executeCommand(command: string, args?: string) {
      if (!command) throw new Error('Command must be defined')
      const a = args ? [args] : []
      return this.execute([command, ...a.concat(this.getFlags())])
   }

   public delete(args: string | string[], namespace?: string) {
      if (typeof args === 'string')
         return this.execute(['delete', args].concat(this.getFlags(namespace)))
      return this.execute(['delete', ...args.concat(this.getFlags(namespace))])
   }

   protected async execute(args: string[], silent: boolean = false) {
      core.debug(`Kubectl run with command: ${this.kubectlPath} ${args}`)

      return await getExecOutput(this.kubectlPath, args, {
         silent
      })
   }

   protected getFlags(namespaceOverride?: string): string[] {
      const flags = []
      if (this.ignoreSSLErrors) {
         flags.push('--insecure-skip-tls-verify')
      }

      const ns = namespaceOverride || this.namespace
      if (ns) {
         flags.push('--namespace', ns)
      }

      return flags
   }
}

export async function getKubectlPath() {
   const version = core.getInput('kubectl-version')
   const kubectlPath = version
      ? toolCache.find('kubectl', version)
      : await io.which('kubectl', true)
   if (!kubectlPath)
      throw Error(
         'kubectl not found. You must install it before running this action'
      )

   return kubectlPath
}
