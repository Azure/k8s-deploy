# Manifest Path Traversal Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a path-traversal vulnerability in `moveFileToTmpDir` / `getFilesFromDirectoriesAndURLs`, and fix a latent error-handling bug in `writeYamlFromURLToFile`.

**Architecture:** Add a module-private `assertPathWithinWorkspace()` helper using `fs.realpathSync` + `path.relative`. Validate every user-supplied manifest path at the entry to `getFilesFromDirectoriesAndURLs`. Rewrite `moveFileToTmpDir` to use basename-only destinations under `RUNNER_TEMP`, with a `getCurrentTime()` uniquifier. Separately, fix `writeYamlFromURLToFile` to drop a misleading `async` keyword, add stream `error` handlers, and `return` after rejecting HTTP errors.

**Tech Stack:** TypeScript (Node 20, ESM), vitest, `@actions/core`, Node built-ins (`fs`, `path`, `https`).

**Branch:** `fix/manifest-path-traversal` (already created)

**Spec:** `docs/superpowers/specs/2026-05-29-manifest-path-traversal-design.md`

---

## File Structure

- **Modify:** `src/utilities/fileUtils.ts` — add helper, rewrite `moveFileToTmpDir`, harden `getFilesFromDirectoriesAndURLs`, fix `writeYamlFromURLToFile`.
- **Modify:** `src/utilities/fileUtils.test.ts` — replace stale `moveFileToTmpDir` test (currently asserts the vulnerable behavior), add traversal + URL-error coverage.
- **Modify:** `CHANGELOG.md` — security entry noting breaking change.

Two commits, scoped per fix.

---

## Task 1: Add `assertPathWithinWorkspace` helper (TDD)

**Files:**

- Modify: `src/utilities/fileUtils.ts` (add private helper near top, after `getTempDirectory`)
- Modify: `src/utilities/fileUtils.test.ts` (add describe block at end)

The helper is module-private (not exported). To unit-test it directly, we'll temporarily export it. After Task 4 we'll keep it exported as `__test_assertPathWithinWorkspace` or simply leave it exported — agent's choice; the simplest path is to export it and document with a leading underscore comment.

- [ ] **Step 1: Write the failing tests**

Append to `src/utilities/fileUtils.test.ts`:

```ts
import os from 'node:os'

describe('assertPathWithinWorkspace', () => {
   let workspace: string
   let outside: string
   let originalWorkspace: string | undefined

   beforeEach(() => {
      originalWorkspace = process.env.GITHUB_WORKSPACE
      workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
      outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
      process.env.GITHUB_WORKSPACE = workspace
   })

   afterEach(() => {
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

   it('throws for relative traversal paths that escape the workspace', () => {
      const target = path.join(outside, 'secrets.yaml')
      fs.writeFileSync(target, 'api_key: secret')
      const rel = path.relative(workspace, target) // ../outside-.../secrets.yaml
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utilities/fileUtils.test.ts -t assertPathWithinWorkspace`
Expected: FAIL — `fileUtils.assertPathWithinWorkspace is not a function`.

- [ ] **Step 3: Implement the helper**

In `src/utilities/fileUtils.ts`, add after `getTempDirectory()` (around line 16):

```ts
// Exported for tests. Validates that `inputPath` resolves (after symlink
// resolution) to a location inside GITHUB_WORKSPACE. When GITHUB_WORKSPACE
// is not set (e.g. local dev / unit tests), the check is skipped — callers
// that write to RUNNER_TEMP still get protection from basename-only
// destinations.
export function assertPathWithinWorkspace(inputPath: string): string {
   const workspace = process.env.GITHUB_WORKSPACE
   if (!workspace) {
      return inputPath
   }
   const resolvedWorkspace = fs.realpathSync(path.resolve(workspace))
   let resolvedInput: string
   try {
      resolvedInput = fs.realpathSync(path.resolve(inputPath))
   } catch (e) {
      throw new Error(
         `manifest path ${inputPath} does not exist or is not readable: ${e}`
      )
   }
   const rel = path.relative(resolvedWorkspace, resolvedInput)
   if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      return resolvedInput
   }
   throw new Error(
      `manifest path ${inputPath} resolves to ${resolvedInput}, ` +
         `which is outside the workspace ${resolvedWorkspace}`
   )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utilities/fileUtils.test.ts -t assertPathWithinWorkspace`
Expected: 6 passing.

- [ ] **Step 5: Do NOT commit yet** — bundle with Task 2 & 3 into one fix commit.

---

## Task 2: Rewrite `moveFileToTmpDir` (basename-only destination)

**Files:**

- Modify: `src/utilities/fileUtils.ts:66-84`
- Modify: `src/utilities/fileUtils.test.ts:110-124` (replace the stale test)

The existing test asserts the vulnerable behavior:

```ts
expect(output).toEqual(path.join(fileUtils.getTempDirectory(), '/path/in/repo'))
```

This must be replaced — the new contract is "basename + uniquifier under RUNNER_TEMP".

- [ ] **Step 1: Replace the existing `moving files to temp` describe block with new failing tests**

Replace the block at `src/utilities/fileUtils.test.ts:110-124` with:

```ts
describe('moveFileToTmpDir', () => {
   let workspace: string
   let originalWorkspace: string | undefined
   let originalTemp: string | undefined
   let tmpDir: string

   beforeEach(() => {
      originalWorkspace = process.env.GITHUB_WORKSPACE
      originalTemp = process.env.RUNNER_TEMP
      workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-'))
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'))
      process.env.GITHUB_WORKSPACE = workspace
      process.env.RUNNER_TEMP = tmpDir
   })

   afterEach(() => {
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
      expect(path.basename(out)).toMatch(/^svc_\d+\.yaml$/)
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
      // ensure clock tick
      const outB = fileUtils.moveFileToTmpDir(path.join(b, 'svc.yaml'))

      expect(outA).not.toBe(outB)
      expect(fs.readFileSync(outA).toString()).toBe('A')
      expect(fs.readFileSync(outB).toString()).toBe('B')
   })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utilities/fileUtils.test.ts -t moveFileToTmpDir`
Expected: FAIL — old implementation returns `<RUNNER_TEMP>/<workspace>/svc.yaml` and does not throw on traversal.

- [ ] **Step 3: Rewrite `moveFileToTmpDir`**

In `src/utilities/fileUtils.ts`, replace lines 66-84 with:

```ts
export function moveFileToTmpDir(originalFilepath: string) {
   const safeSource = assertPathWithinWorkspace(originalFilepath)
   const tempDirectory = getTempDirectory()
   const ext = path.extname(safeSource)
   const base = path.basename(safeSource, ext)
   const uniqueName = `${base}_${getCurrentTime()}${ext}`
   const newPath = path.join(tempDirectory, uniqueName)

   core.debug(`reading original contents from path: ${originalFilepath}`)
   const contents = fs.readFileSync(safeSource)

   core.debug(`writing contents to new path ${newPath}`)
   fs.writeFileSync(newPath, contents)

   core.debug(`moved contents from ${originalFilepath} to ${newPath}`)
   return newPath
}
```

Note: removed the `mkdirSync` block — `tempDirectory` always exists, and we no longer create caller-controlled subdirs.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/utilities/fileUtils.test.ts -t moveFileToTmpDir`
Expected: 3 passing. If the "share a basename" test fails because both calls land on the same millisecond, the agent should add a brief `await new Promise(r => setTimeout(r, 2))` between them — but first check `getCurrentTime()` resolution in `src/utilities/timeUtils.ts`.

- [ ] **Step 5: Do NOT commit yet** — continue to Task 3.

---

## Task 3: Validate paths at the entry to `getFilesFromDirectoriesAndURLs`

**Files:**

- Modify: `src/utilities/fileUtils.ts:92-135`
- Modify: `src/utilities/fileUtils.test.ts` (extend the existing `File utils` describe block)

- [ ] **Step 1: Add failing tests**

Add inside the existing `describe('File utils', ...)` block in `src/utilities/fileUtils.test.ts`:

```ts
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
```

Also add `import os from 'node:os'` at the top of the test file if not already added in Task 1.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run src/utilities/fileUtils.test.ts -t "rejects manifest inputs"`
Expected: FAIL — current code accepts the path.

- [ ] **Step 3: Add the guard in `getFilesFromDirectoriesAndURLs`**

In `src/utilities/fileUtils.ts`, modify the loop in `getFilesFromDirectoriesAndURLs` (around line 98). Replace the body of the `for` loop with:

```ts
for (const fileName of filePaths) {
   try {
      if (isHttpUrl(fileName)) {
         try {
            const tempFilePath: string = await writeYamlFromURLToFile(
               fileName,
               fileCounter++
            )
            fullPathSet.add(tempFilePath)
         } catch (e) {
            throw Error(
               `encountered error trying to pull YAML from URL ${fileName}: ${e}`
            )
         }
         continue
      }

      const safePath = assertPathWithinWorkspace(fileName)

      if (fs.lstatSync(safePath).isDirectory()) {
         recurisveManifestGetter(safePath).forEach((file) => {
            fullPathSet.add(file)
         })
      } else if (
         getFileExtension(safePath) === 'yml' ||
         getFileExtension(safePath) === 'yaml'
      ) {
         fullPathSet.add(safePath)
      } else {
         core.debug(`Detected non-manifest file, ${fileName}, continuing... `)
      }
   } catch (ex) {
      throw Error(
         `Exception occurred while reading the file ${fileName}: ${ex}`
      )
   }
}
```

Key changes vs. current:

- URL branch is handled then `continue`s, since URLs bypass workspace containment.
- All disk paths go through `assertPathWithinWorkspace` before `lstatSync` / `readdirSync`.
- `recurisveManifestGetter` is called with the resolved absolute path, so its discovered files are intrinsically contained.

- [ ] **Step 4: Run the full file's tests**

Run: `npx vitest run src/utilities/fileUtils.test.ts`
Expected: all tests pass. The existing tests use relative paths like `test/unit/manifests` which resolve under `process.cwd()` — that's the workspace in dev/CI, so they should still pass. If `GITHUB_WORKSPACE` is unset during `npm test`, the helper short-circuits and they pass trivially. If it's set to something other than the repo root in CI, those tests may need `process.env.GITHUB_WORKSPACE = process.cwd()` in a `beforeAll`. Verify locally; if needed, add:

```ts
beforeAll(() => {
   process.env.GITHUB_WORKSPACE ??= process.cwd()
})
```

at the top of the `File utils` describe.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Update CHANGELOG.md**

Add an entry at the top under a `## Unreleased` heading (create the heading if missing):

```md
## Unreleased

### Security

- Confine `manifests` inputs to `GITHUB_WORKSPACE`. Paths that resolve
  outside the workspace (via `../` traversal, absolute paths, or
  symlinks) now cause the action to fail with a clear error instead of
  reading and copying files from outside the workspace. Files copied
  into `RUNNER_TEMP` now use a basename-only destination, preventing
  the copy step from writing outside `RUNNER_TEMP`. This is a breaking
  change for workflows that rely on out-of-workspace manifest paths.
```

- [ ] **Step 7: Commit fix 1**

```bash
git add src/utilities/fileUtils.ts src/utilities/fileUtils.test.ts CHANGELOG.md
git commit -m "fix: confine manifest paths to workspace

moveFileToTmpDir previously used path.join(tempDirectory, originalFilepath),
which normalizes ../ sequences. A manifests input containing a traversal
sequence caused the action to read .yaml/.yml files from outside the
workspace and write copies outside RUNNER_TEMP. Directory inputs made
this stronger because recurisveManifestGetter enumerated YAML files
under the traversed directory.

Add assertPathWithinWorkspace, which resolves symlinks via realpathSync
and rejects any path not contained in GITHUB_WORKSPACE. Apply it in
getFilesFromDirectoriesAndURLs before lstat / readdir / file inclusion.
Rewrite moveFileToTmpDir to use a basename-only destination under
RUNNER_TEMP with a getCurrentTime() uniquifier to avoid collisions,
matching the safer pattern already used by getNewTempManifestFileName."
```

---

## Task 4: Fix `writeYamlFromURLToFile` error handling (TDD)

**Files:**

- Modify: `src/utilities/fileUtils.ts:137-180`
- Modify: `src/utilities/fileUtils.test.ts` (extend existing URL tests)

- [ ] **Step 1: Add failing tests using a local http server**

Append to `src/utilities/fileUtils.test.ts`:

```ts
import http from 'node:http'

describe('writeYamlFromURLToFile error handling', () => {
   let server: http.Server
   let baseUrl: string
   let handler: (req: http.IncomingMessage, res: http.ServerResponse) => void

   beforeAll(async () => {
      server = http.createServer((req, res) => handler(req, res))
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
      const addr = server.address() as {port: number}
      baseUrl = `http://127.0.0.1:${addr.port}`
   })

   afterAll(async () => {
      await new Promise<void>((r) => server.close(() => r()))
   })

   // writeYamlFromURLToFile uses https.get directly, so these cases must
   // go through https. The simplest portable path is to test the behavior
   // by injecting via a parallel http-aware helper, OR adjust the SUT to
   // accept either http or https. To keep this targeted, the SUT change
   // in Step 3 keeps using https.get; these tests instead drive the
   // behavior through the existing failing-URL test and a unit-level
   // shape check on the rewritten function. See Step 1b below.
})
```

Note: `writeYamlFromURLToFile` hardcodes `https.get`, so a local `http` server cannot exercise it directly. Use `vi.mock` on the `https` module instead:

- [ ] **Step 1b: Replace the placeholder block above with `vi.mock`-based tests**

Replace the `describe('writeYamlFromURLToFile error handling', ...)` block with:

```ts
import {EventEmitter} from 'node:events'
import {PassThrough} from 'node:stream'

describe('writeYamlFromURLToFile error handling', () => {
   afterEach(() => {
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
      const https = require('https') as typeof import('https')
      vi.spyOn(https, 'get').mockImplementation(((url: string, cb?: any) => {
         const {response, requestEmitter} = makeResponse()
         if (cb) setImmediate(() => cb(response))
         return requestEmitter as any
      }) as any)
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
```

- [ ] **Step 2: Run tests to verify (some) fail**

Run: `npx vitest run src/utilities/fileUtils.test.ts -t "writeYamlFromURLToFile error handling"`
Expected: at minimum the response-stream-error and request-error tests fail or hang — current code has no `error` listeners. The 500 test may also fail because the current code rejects then continues into the file-write branch.

- [ ] **Step 3: Rewrite `writeYamlFromURLToFile`**

Replace lines 137-180 of `src/utilities/fileUtils.ts` with:

```ts
export async function writeYamlFromURLToFile(
   url: string,
   fileNumber: number
): Promise<string> {
   return new Promise((resolve, reject) => {
      https
         .get(url, (response) => {
            const code = response.statusCode ?? 0
            if (code >= 400) {
               response.resume()
               reject(
                  new Error(
                     `received response status ${response.statusMessage} from url ${url}`
                  )
               )
               return
            }

            const targetPath = getNewTempManifestFileName(
               urlFileKind,
               fileNumber.toString()
            )
            const fileWriter = fs.createWriteStream(targetPath)
            fileWriter.on('error', reject)
            fileWriter.on('finish', () => {
               const verification = verifyYaml(targetPath, url)
               if (succeeded(verification)) {
                  core.debug(
                     `outputting YAML contents from ${url} to ${targetPath}: ${JSON.stringify(
                        verification.result
                     )}`
                  )
                  resolve(targetPath)
               } else {
                  reject(new Error(verification.error))
               }
            })
            response.on('error', reject)
            response.pipe(fileWriter)
         })
         .on('error', reject)
   })
}
```

Changes:

- Dropped `async` from the get callback (it never awaited anything; the keyword silently swallowed throws).
- `return` after the HTTP-error `reject` so the success branch no longer runs.
- `response.resume()` to drain the body on early reject.
- `error` handlers on both `response` and `fileWriter`.
- Wrapped `verification.error` (a string) in `new Error()`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/utilities/fileUtils.test.ts`
Expected: all tests pass. The network-dependent tests (`correctly parses a yaml file from a URL`, etc.) should still pass.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit fix 2**

```bash
git add src/utilities/fileUtils.ts src/utilities/fileUtils.test.ts
git commit -m "fix: handle errors in writeYamlFromURLToFile

The https.get callback was marked async without any await, which caused
thrown errors to be silently swallowed as floating promise rejections.
There were no error listeners on the response stream or the file
writer, so socket or disk errors hung the promise instead of rejecting
it. On HTTP status >= 400 the function called reject but then fell
through and opened a write stream anyway.

Drop the misleading async, return after rejecting HTTP errors, drain
the response, and add error listeners on both streams. Wrap the string
verification error in new Error so stack traces are preserved."
```

---

## Task 5: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Confirm the branch is ready**

Run: `git log --oneline origin/main..HEAD`
Expected: 3 commits — design doc, fix 1, fix 2.

Run: `git status`
Expected: clean working tree.

---

## Self-Review Summary

- **Spec coverage:**
   - `assertPathWithinWorkspace` helper → Task 1 ✅
   - `moveFileToTmpDir` basename rewrite + uniquifier → Task 2 ✅
   - Entry-point validation in `getFilesFromDirectoriesAndURLs` (covers `recurisveManifestGetter` indirectly via resolved paths) → Task 3 ✅
   - Hard-error behavior → exercised in Tasks 2 & 3 ✅
   - `GITHUB_WORKSPACE` unset fallback → Task 1 test ✅
   - Symlink hardening via realpath → Task 1 test ✅
   - Basename collision handling → Task 2 test ✅
   - `writeYamlFromURLToFile` async/error fix → Task 4 ✅
   - CHANGELOG entry → Task 3 ✅
   - Two commits → Tasks 3 & 4 ✅

- **Placeholders:** none.

- **Type/name consistency:** helper named `assertPathWithinWorkspace` throughout; uniquifier uses `getCurrentTime()` (already imported in `fileUtils.ts`); test file imports `os` once (added in Task 1, reused in later tasks).

- **Known risk:** if `getCurrentTime()` returns millisecond precision, the "share a basename" test in Task 2 may collide on fast machines — the task notes the fix (a 2ms delay) and points at `timeUtils.ts` to confirm resolution before resorting to it.
