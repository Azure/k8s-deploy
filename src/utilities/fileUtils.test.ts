import {vi} from 'vitest'
import * as fileUtils from './fileUtils.js'

import * as yaml from 'js-yaml'
import fs from 'node:fs'
import os from 'node:os'
import * as path from 'path'
import {K8sObject} from '../types/k8sObject.js'

const sampleYamlUrl =
   'https://raw.githubusercontent.com/kubernetes/website/main/content/en/examples/controllers/nginx-deployment.yaml'
describe('File utils', () => {
   beforeAll(() => {
      process.env.GITHUB_WORKSPACE ??= process.cwd()
   })
   test('correctly parses a yaml file from a URL', async () => {
      const tempFile = await fileUtils.writeYamlFromURLToFile(sampleYamlUrl, 0)
      const fileContents = fs.readFileSync(tempFile).toString()
      const inputObjects: K8sObject[] = yaml.loadAll(
         fileContents
      ) as K8sObject[]
      expect(inputObjects).toHaveLength(1)

      for (const obj of inputObjects) {
         expect(obj.metadata.name).toBe('nginx-deployment')
         expect(obj.kind).toBe('Deployment')
      }
   })

   it('fails when a bad URL is given among other files', async () => {
      const badUrl = 'https://www.github.com'

      const testPath = path.join('test', 'unit', 'manifests')
      await expect(
         fileUtils.getFilesFromDirectoriesAndURLs([testPath, badUrl])
      ).rejects.toThrow()
   })

   it('detects files in nested directories with the same name and ignores non-manifest files and empty dirs', async () => {
      const testPath = path.join('test', 'unit', 'manifests')
      const testSearch: string[] =
         await fileUtils.getFilesFromDirectoriesAndURLs([
            testPath,
            sampleYamlUrl
         ])

      const expectedManifests = [
         'test/unit/manifests/manifest_test_dir/another_layer/test-ingress.yaml',
         'test/unit/manifests/manifest_test_dir/another_layer/nested-test-service.yaml',
         'test/unit/manifests/manifest_test_dir/nested-test-service.yaml',
         'test/unit/manifests/test-ingress.yml',
         'test/unit/manifests/test-ingress-new.yml',
         'test/unit/manifests/test-service.yml',
         'test/unit/manifests/basic-test.yml'
      ]

      expect(testSearch).toHaveLength(10)
      expectedManifests.forEach((fileName) => {
         if (fileName.startsWith('test/unit')) {
            expect(testSearch).toContain(path.resolve(fileName))
         } else {
            expect(fileName.includes(fileUtils.urlFileKind)).toBe(true)
            expect(fileName.startsWith(fileUtils.getTempDirectory()))
         }
      })
   })

   it('crashes when an invalid file is provided', async () => {
      const badPath = path.join('test', 'unit', 'manifests', 'nonexistent.yaml')
      const goodPath = path.join(
         'test',
         'unit',
         'manifests',
         'manifest_test_dir'
      )

      await expect(
         fileUtils.getFilesFromDirectoriesAndURLs([badPath, goodPath])
      ).rejects.toThrow()
   })

   it("doesn't duplicate files when nested dir included", async () => {
      const outerPath = path.join('test', 'unit', 'manifests')
      const fileAtOuter = path.join(
         'test',
         'unit',
         'manifests',
         'test-service.yml'
      )
      const innerPath = path.join(
         'test',
         'unit',
         'manifests',
         'manifest_test_dir'
      )

      expect(
         await fileUtils.getFilesFromDirectoriesAndURLs([
            outerPath,
            fileAtOuter,
            innerPath
         ])
      ).toHaveLength(9)
   })

   it('throws an error for an invalid URL', async () => {
      const badUrl = 'https://www.github.com'
      await expect(
         fileUtils.writeYamlFromURLToFile(badUrl, 0)
      ).rejects.toBeTruthy()
   })

   it('rejects manifest inputs that resolve outside the workspace', async () => {
      const originalWs = process.env.GITHUB_WORKSPACE
      const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
      fs.writeFileSync(path.join(outside, 'secrets.yaml'), 'api_key: x')
      process.env.GITHUB_WORKSPACE = ws
      try {
         await expect(
            fileUtils.getFilesFromDirectoriesAndURLs([outside])
         ).rejects.toThrow(/outside the workspace/)
         await expect(
            fileUtils.getFilesFromDirectoriesAndURLs([
               path.join(outside, 'secrets.yaml')
            ])
         ).rejects.toThrow(/outside the workspace/)
      } finally {
         if (originalWs === undefined) delete process.env.GITHUB_WORKSPACE
         else process.env.GITHUB_WORKSPACE = originalWs
         fs.rmSync(ws, {recursive: true, force: true})
         fs.rmSync(outside, {recursive: true, force: true})
      }
   })

   it('rejects symlinks inside a directory that escape the workspace', async () => {
      const originalWs = process.env.GITHUB_WORKSPACE
      const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
      const escapeTarget = path.join(outside, 'passwd.yaml')
      fs.writeFileSync(escapeTarget, 'root:x:0:0')
      const dir = path.join(ws, 'manifests')
      fs.mkdirSync(dir)
      fs.symlinkSync(escapeTarget, path.join(dir, 'escape.yaml'))
      process.env.GITHUB_WORKSPACE = ws
      try {
         await expect(
            fileUtils.getFilesFromDirectoriesAndURLs([dir])
         ).rejects.toThrow(/outside the workspace/)
      } finally {
         if (originalWs === undefined) delete process.env.GITHUB_WORKSPACE
         else process.env.GITHUB_WORKSPACE = originalWs
         fs.rmSync(ws, {recursive: true, force: true})
         fs.rmSync(outside, {recursive: true, force: true})
      }
   })
})

describe('moveFileToTmpDir', () => {
   let workspace: string
   let originalWorkspace: string | undefined
   let originalTemp: string | undefined
   let originalCwd: string
   let tmpDir: string

   beforeEach(() => {
      originalWorkspace = process.env.GITHUB_WORKSPACE
      originalTemp = process.env.RUNNER_TEMP
      originalCwd = process.cwd()
      workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'))
      process.env.GITHUB_WORKSPACE = workspace
      process.env.RUNNER_TEMP = tmpDir
   })

   afterEach(() => {
      process.chdir(originalCwd)
      if (originalWorkspace === undefined) delete process.env.GITHUB_WORKSPACE
      else process.env.GITHUB_WORKSPACE = originalWorkspace
      if (originalTemp === undefined) delete process.env.RUNNER_TEMP
      else process.env.RUNNER_TEMP = originalTemp
      fs.rmSync(workspace, {recursive: true, force: true})
      fs.rmSync(tmpDir, {recursive: true, force: true})
   })

   it('copies a workspace file to RUNNER_TEMP using a basename-only destination', () => {
      const src = path.join(workspace, 'svc.yaml')
      fs.writeFileSync(src, 'kind: Service')

      const out = fileUtils.moveFileToTmpDir(src)

      expect(path.dirname(out)).toBe(fs.realpathSync(tmpDir))
      expect(path.basename(out)).toMatch(/^svc_\d+_\d+\.yaml$/)
      expect(fs.readFileSync(out).toString()).toBe('kind: Service')
   })

   it('rejects relative traversal that escapes the workspace', () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
      fs.writeFileSync(path.join(outside, 'secrets.yaml'), 'api_key: x')
      process.chdir(workspace)
      const rel = path.relative(workspace, path.join(outside, 'secrets.yaml'))
      expect(() => fileUtils.moveFileToTmpDir(rel)).toThrow(
         /outside the workspace/
      )
      fs.rmSync(outside, {recursive: true, force: true})
   })

   it('does not collide when two inputs share a basename', () => {
      const a = path.join(workspace, 'a')
      const b = path.join(workspace, 'b')
      fs.mkdirSync(a)
      fs.mkdirSync(b)
      fs.writeFileSync(path.join(a, 'svc.yaml'), 'A')
      fs.writeFileSync(path.join(b, 'svc.yaml'), 'B')

      const outA = fileUtils.moveFileToTmpDir(path.join(a, 'svc.yaml'))
      const outB = fileUtils.moveFileToTmpDir(path.join(b, 'svc.yaml'))

      expect(outA).not.toBe(outB)
      expect(fs.readFileSync(outA).toString()).toBe('A')
      expect(fs.readFileSync(outB).toString()).toBe('B')
   })
})

describe('assertPathWithinWorkspace', () => {
   let workspace: string
   let outside: string
   let originalWorkspace: string | undefined
   let originalCwd: string

   beforeEach(() => {
      originalWorkspace = process.env.GITHUB_WORKSPACE
      originalCwd = process.cwd()
      workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
      outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
      process.env.GITHUB_WORKSPACE = workspace
   })

   afterEach(() => {
      process.chdir(originalCwd)
      if (originalWorkspace === undefined) {
         delete process.env.GITHUB_WORKSPACE
      } else {
         process.env.GITHUB_WORKSPACE = originalWorkspace
      }
      fs.rmSync(workspace, {recursive: true, force: true})
      fs.rmSync(outside, {recursive: true, force: true})
   })

   it('returns the resolved path for files inside the workspace', () => {
      const inside = path.join(workspace, 'a.yaml')
      fs.writeFileSync(inside, 'kind: X')
      const result = fileUtils.assertPathWithinWorkspace(inside)
      expect(result).toBe(fs.realpathSync(inside))
   })

   it('accepts workspace files whose basename starts with ..', () => {
      const inside = path.join(workspace, '..bar.yaml')
      fs.writeFileSync(inside, 'kind: X')
      expect(fileUtils.assertPathWithinWorkspace(inside)).toBe(
         fs.realpathSync(inside)
      )
   })

   it('throws for relative traversal paths that escape the workspace', () => {
      const target = path.join(outside, 'secrets.yaml')
      fs.writeFileSync(target, 'api_key: secret')
      const rel = path.relative(workspace, target)
      process.chdir(workspace)
      expect(() => fileUtils.assertPathWithinWorkspace(rel)).toThrow(
         /outside the workspace/
      )
   })

   it('throws for absolute paths outside the workspace', () => {
      const target = path.join(outside, 'secrets.yaml')
      fs.writeFileSync(target, 'api_key: secret')
      expect(() => fileUtils.assertPathWithinWorkspace(target)).toThrow(
         /outside the workspace/
      )
   })

   it('throws when a symlink inside the workspace points outside', () => {
      const target = path.join(outside, 'secrets.yaml')
      fs.writeFileSync(target, 'api_key: secret')
      const link = path.join(workspace, 'evil.yaml')
      fs.symlinkSync(target, link)
      expect(() => fileUtils.assertPathWithinWorkspace(link)).toThrow(
         /outside the workspace/
      )
   })

   it('throws a clear error for missing files', () => {
      const missing = path.join(workspace, 'nope.yaml')
      expect(() => fileUtils.assertPathWithinWorkspace(missing)).toThrow(
         /does not exist or is not readable/
      )
   })

   it('skips containment when GITHUB_WORKSPACE is unset', () => {
      delete process.env.GITHUB_WORKSPACE
      const target = path.join(outside, 'whatever.yaml')
      fs.writeFileSync(target, 'kind: X')
      expect(fileUtils.assertPathWithinWorkspace(target)).toBe(target)
   })
})

import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'
import * as https from 'node:https'

const httpsState = vi.hoisted(() => ({impl: null as any}))

vi.mock('https', async (importOriginal) => {
   const actual = await importOriginal<typeof import('https')>()
   const get = (...args: any[]) =>
      httpsState.impl ? httpsState.impl(...args) : (actual.get as any)(...args)
   return {
      ...actual,
      default: {...actual, get},
      get
   }
})

describe('writeYamlFromURLToFile error handling', () => {
   afterEach(() => {
      httpsState.impl = null
      vi.restoreAllMocks()
   })

   function mockHttpsGet(
      makeResponse: () => {
         response: EventEmitter & {
            statusCode?: number
            statusMessage?: string
            pipe: PassThrough['pipe']
            resume: () => void
         }
         requestEmitter: EventEmitter
      }
   ) {
      httpsState.impl = ((url: string, cb?: any) => {
         const {response, requestEmitter} = makeResponse()
         if (cb) setImmediate(() => cb(response))
         return requestEmitter as any
      }) as any
   }

   it('rejects on HTTP 500 without writing a file', async () => {
      const requestEmitter = new EventEmitter()
      const response = Object.assign(new PassThrough(), {
         statusCode: 500,
         statusMessage: 'Server Error',
         resume() {
            /* drain */
         }
      })
      mockHttpsGet(() => ({response: response as any, requestEmitter}))

      await expect(
         fileUtils.writeYamlFromURLToFile('https://example.com/x.yaml', 99)
      ).rejects.toThrow(/Server Error/)
   })

   it('rejects when the response stream errors mid-download', async () => {
      const requestEmitter = new EventEmitter()
      const response = Object.assign(new PassThrough(), {
         statusCode: 200,
         statusMessage: 'OK',
         resume() {}
      })
      mockHttpsGet(() => ({response: response as any, requestEmitter}))

      const p = fileUtils.writeYamlFromURLToFile(
         'https://example.com/y.yaml',
         100
      )
      setImmediate(() => response.emit('error', new Error('socket reset')))
      await expect(p).rejects.toThrow(/socket reset/)
   })

   it('rejects on request-level errors', async () => {
      const requestEmitter = new EventEmitter()
      const response = Object.assign(new PassThrough(), {
         statusCode: 200,
         resume() {}
      })
      mockHttpsGet(() => ({response: response as any, requestEmitter}))

      const p = fileUtils.writeYamlFromURLToFile(
         'https://example.com/z.yaml',
         101
      )
      setImmediate(() => requestEmitter.emit('error', new Error('DNS failure')))
      await expect(p).rejects.toThrow(/DNS failure/)
   })
})
