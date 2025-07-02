import {getKubectlPath, Kubectl} from './kubectl'
import * as exec from '@actions/exec'
import * as io from '@actions/io'
import * as core from '@actions/core'
import * as toolCache from '@actions/tool-cache'

describe('Kubectl path', () => {
   const version = '1.1'
   const path = 'path'

   it('gets the kubectl path', async () => {
      jest.spyOn(core, 'getInput').mockImplementationOnce(() => '')
      jest.spyOn(io, 'which').mockImplementationOnce(async () => path)

      expect(await getKubectlPath()).toBe(path)
   })

   it('gets the kubectl path with version', async () => {
      jest.spyOn(core, 'getInput').mockImplementationOnce(() => version)
      jest.spyOn(toolCache, 'find').mockImplementationOnce(() => path)

      expect(await getKubectlPath()).toBe(path)
   })

   it('throws if kubectl not found', async () => {
      // without version
      jest.spyOn(io, 'which').mockImplementationOnce(async () => '')
      await expect(() => getKubectlPath()).rejects.toThrow()

      // with verision
      jest.spyOn(core, 'getInput').mockImplementationOnce(() => '')
      jest.spyOn(io, 'which').mockImplementationOnce(async () => '')
      await expect(() => getKubectlPath()).rejects.toThrow()
   })
})

const kubectlPath = 'kubectlPath'
const testNamespace = 'testNamespace'
const defaultNamespace = 'default'
const otherNamespace = 'otherns'
describe('Kubectl class', () => {
   describe('with a success exec return in testNamespace', () => {
      const kubectl = new Kubectl(kubectlPath, testNamespace)
      const execReturn = {exitCode: 0, stdout: 'Output', stderr: ''}

      beforeEach(() => {
         jest.spyOn(exec, 'getExecOutput').mockImplementation(async () => {
            return execReturn
         })
      })

      it('applies a configuration with a single config path', async () => {
         const configPaths = 'configPaths'
         const result = await kubectl.apply(configPaths)
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            ['apply', '-f', configPaths, '--namespace', testNamespace],
            {silent: false}
         )
      })

      it('applies a configuration with multiple config paths', async () => {
         const configPaths = ['configPath1', 'configPath2', 'configPath3']
         const result = await kubectl.apply(configPaths)
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'apply',
               '-f',
               configPaths[0] + ',' + configPaths[1] + ',' + configPaths[2],
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )
      })

      it('applies a configuration with force when specified', async () => {
         const configPaths = ['configPath1', 'configPath2', 'configPath3']
         const result = await kubectl.apply(configPaths, true, false)
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'apply',
               '-f',
               configPaths[0] + ',' + configPaths[1] + ',' + configPaths[2],
               '--force',
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )
      })

      it('applies a configuration with server-side when specified', async () => {
         const configPaths = ['configPath1', 'configPath2', 'configPath3']
         const result = await kubectl.apply(configPaths, false, true)
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'apply',
               '-f',
               configPaths[0] + ',' + configPaths[1] + ',' + configPaths[2],
               '--server-side',
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )
      })

      it('describes a resource', async () => {
         const resourceType = 'type'
         const resourceName = 'name'
         const result = await kubectl.describe(resourceType, resourceName)
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'describe',
               resourceType,
               resourceName,
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )

         // overrided ns
         const silent = false
         await kubectl.describe(
            resourceType,
            resourceName,
            silent,
            otherNamespace
         )
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'describe',
               resourceType,
               resourceName,
               '--namespace',
               otherNamespace
            ],
            {silent}
         )
      })

      it('describes a resource silently', async () => {
         const resourceType = 'type'
         const resourceName = 'name'
         const result = await kubectl.describe(resourceType, resourceName, true)
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'describe',
               resourceType,
               resourceName,
               '--namespace',
               testNamespace
            ],
            {silent: true}
         )

         // overrided ns
         const silent = false
         await kubectl.describe(
            resourceType,
            resourceName,
            silent,
            otherNamespace
         )
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'describe',
               resourceType,
               resourceName,
               '--namespace',
               otherNamespace
            ],
            {silent}
         )
      })

      it('annotates resource', async () => {
         const resourceType = 'type'
         const resourceName = 'name'
         const annotation = 'annotation'
         const result = await kubectl.annotate(
            resourceType,
            resourceName,
            annotation
         )
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'annotate',
               resourceType,
               resourceName,
               annotation,
               '--overwrite',
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )

         // override ns
         await kubectl.annotate(
            resourceType,
            resourceName,
            annotation,
            otherNamespace
         )
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'annotate',
               resourceType,
               resourceName,
               annotation,
               '--overwrite',
               '--namespace',
               otherNamespace
            ],
            {silent: false}
         )
      })

      it('annotates files with single file', async () => {
         const file = 'file'
         const annotation = 'annotation'
         const result = await kubectl.annotateFiles(file, annotation)
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'annotate',
               '-f',
               file,
               annotation,
               '--overwrite',
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )

         // override ns
         await kubectl.annotateFiles(file, annotation, otherNamespace)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'annotate',
               '-f',
               file,
               annotation,
               '--overwrite',
               '--namespace',
               otherNamespace
            ],
            {silent: false}
         )
      })

      it('annotates files with mulitple files', async () => {
         const files = ['file1', 'file2', 'file3']
         const annotation = 'annotation'
         const result = await kubectl.annotateFiles(files, annotation)
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'annotate',
               '-f',
               files.join(','),
               annotation,
               '--overwrite',
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )

         // override ns
         await kubectl.annotateFiles(files, annotation, otherNamespace)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'annotate',
               '-f',
               files.join(','),
               annotation,
               '--overwrite',
               '--namespace',
               otherNamespace
            ],
            {silent: false}
         )
      })

      it('labels files with single file', async () => {
         const file = 'file'
         const labels = ['label1', 'label2']
         const result = await kubectl.labelFiles(file, labels)
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'label',
               '-f',
               file,
               ...labels,
               '--overwrite',
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )

         await kubectl.labelFiles(file, labels, otherNamespace)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'label',
               '-f',
               file,
               ...labels,
               '--overwrite',
               '--namespace',
               otherNamespace
            ],
            {silent: false}
         )
      })

      it('labels files with multiple files', async () => {
         const files = ['file1', 'file2', 'file3']
         const labels = ['label1', 'label2']
         const result = await kubectl.labelFiles(files, labels)
         expect(result).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'label',
               '-f',
               files.join(','),
               ...labels,
               '--overwrite',
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )

         await kubectl.labelFiles(files, labels, otherNamespace)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'label',
               '-f',
               files.join(','),
               ...labels,
               '--overwrite',
               '--namespace',
               otherNamespace
            ],
            {silent: false}
         )
      })

      it('gets all pods', async () => {
         expect(await kubectl.getAllPods()).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            ['get', 'pods', '-o', 'json', '--namespace', testNamespace],
            {silent: true}
         )
      })

      it('checks rollout status', async () => {
         const resourceType = 'type'
         const name = 'name'
         expect(await kubectl.checkRolloutStatus(resourceType, name)).toBe(
            execReturn
         )
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'rollout',
               'status',
               `${resourceType}/${name}`,
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )

         // override ns
         await kubectl.checkRolloutStatus(resourceType, name, otherNamespace)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'rollout',
               'status',
               `${resourceType}/${name}`,
               '--namespace',
               otherNamespace
            ],
            {silent: false}
         )
      })

      it('gets resource', async () => {
         const resourceType = 'type'
         const name = 'name'
         expect(await kubectl.getResource(resourceType, name)).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'get',
               `${resourceType}/${name}`,
               '-o',
               'json',
               '--namespace',
               testNamespace
            ],
            {silent: false}
         )

         // override ns
         const silent = true
         await kubectl.getResource(resourceType, name, silent, otherNamespace)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [
               'get',
               `${resourceType}/${name}`,
               '-o',
               'json',
               '--namespace',
               otherNamespace
            ],
            {silent}
         )
      })

      it('executes a command', async () => {
         // no args
         const command = 'command'
         expect(await kubectl.executeCommand(command)).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [command, '--namespace', testNamespace],
            {silent: false}
         )

         // with args
         const args = 'args'
         expect(await kubectl.executeCommand(command, args)).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            [command, args, '--namespace', testNamespace],
            {silent: false}
         )
      })

      it('deletes with single argument', async () => {
         const arg = 'argument'
         expect(await kubectl.delete(arg)).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            ['delete', arg, '--namespace', testNamespace],
            {silent: false}
         )

         // override ns
         await kubectl.delete(arg, otherNamespace)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            ['delete', arg, '--namespace', otherNamespace],
            {silent: false}
         )
      })

      it('deletes with multiple arguments', async () => {
         const args = ['argument1', 'argument2', 'argument3']
         expect(await kubectl.delete(args)).toBe(execReturn)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            ['delete', ...args, '--namespace', testNamespace],
            {silent: false}
         )

         // override ns
         await kubectl.delete(args, otherNamespace)
         expect(exec.getExecOutput).toHaveBeenCalledWith(
            kubectlPath,
            ['delete', ...args, '--namespace', otherNamespace],
            {silent: false}
         )
      })
   })

   it('gets new replica sets', async () => {
      const kubectl = new Kubectl(kubectlPath, testNamespace)

      const newReplicaSetName = 'newreplicaset'
      const name = 'name'
      const describeReturn = {
         exitCode: 0,
         stdout: newReplicaSetName + name + ' ' + 'extra',
         stderr: ''
      }

      jest.spyOn(exec, 'getExecOutput').mockImplementationOnce(async () => {
         return describeReturn
      })

      const deployment = 'deployment'
      const result = await kubectl.getNewReplicaSet(deployment)
      expect(result).toBe(name)
   })

   it('executes with constructor flags', async () => {
      const skipTls = true
      const kubectl = new Kubectl(kubectlPath, testNamespace, skipTls)

      jest.spyOn(exec, 'getExecOutput').mockImplementation(async () => {
         return {exitCode: 0, stderr: '', stdout: ''}
      })

      const command = 'command'
      kubectl.executeCommand(command)
      expect(exec.getExecOutput).toHaveBeenCalledWith(
         kubectlPath,
         [command, '--insecure-skip-tls-verify', '--namespace', testNamespace],
         {silent: false}
      )

      const kubectlNoFlags = new Kubectl(kubectlPath)
      kubectlNoFlags.executeCommand(command)
      expect(exec.getExecOutput).toHaveBeenCalledWith(kubectlPath, [command], {
         silent: false
      })
   })
})
