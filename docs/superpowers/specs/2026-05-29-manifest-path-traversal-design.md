# Manifest Path Traversal Fix — Design

## Background

`moveFileToTmpDir()` in `src/utilities/fileUtils.ts` builds its write
destination using `path.join(tempDirectory, originalFilepath)`. In
Node.js, `path.join()` normalizes `../` sequences rather than blocking
them, so a `manifests` input containing traversal sequences (e.g.
`../../.config/myapp/secrets.yaml`) causes the action to:

1. Read a `.yaml` / `.yml` file from outside the workspace, and
2. Write a copy to a path outside `RUNNER_TEMP`.

The copied file is then passed to `kubectl apply -f`. If it is not a
valid Kubernetes manifest, `kubectl` error output may surface field
names or YAML excerpts in CI logs.

`recurisveManifestGetter()` makes this stronger: a traversal _directory_
path lets a caller enumerate `.yaml`/`.yml` files anywhere readable
without knowing filenames in advance.

The same file already demonstrates the safer pattern:
`getNewTempManifestFileName()` uses `path.basename()`. The fix brings
`moveFileToTmpDir()` in line with that pattern and adds a workspace
containment check on the read side.

While reviewing, a second (unrelated) bug was identified in
`writeYamlFromURLToFile()` — the `https.get` callback is marked `async`
without any `await`, throws are swallowed, and there is no error
handling on the response or file-writer streams, plus the HTTP-error
branch falls through to write the file anyway. This spec addresses both.

## Scope

Two fixes in `src/utilities/fileUtils.ts`:

1. **Path traversal hardening** — `moveFileToTmpDir`,
   `getFilesFromDirectoriesAndURLs`, `recurisveManifestGetter`.
2. **Async / error-handling fix** — `writeYamlFromURLToFile`.

Out of scope (separate cleanup PRs):

- Renaming the `recurisveManifestGetter` typo.
- Refactoring redundant `path.join(fileName)` calls in
  `writeObjectsToFile` / `writeManifestToFile`.

## Fix 1: Path Traversal

### New module-private helper

```ts
function assertPathWithinWorkspace(inputPath: string): string {
   const workspace = process.env.GITHUB_WORKSPACE
   if (!workspace) {
      // No workspace set (e.g. local tests). Skip the containment
      // check; basename-only destinations still protect RUNNER_TEMP.
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
   if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(
         `manifest path ${inputPath} resolves to ${resolvedInput}, ` +
            `which is outside the workspace ${resolvedWorkspace}`
      )
   }
   return resolvedInput
}
```

`fs.realpathSync` defeats symlink escapes; `path.relative` then `..`
check is the standard containment idiom.

### `moveFileToTmpDir` rewrite

```ts
export function moveFileToTmpDir(originalFilepath: string) {
   const safeSource = assertPathWithinWorkspace(originalFilepath)
   const tempDirectory = getTempDirectory()
   const ext = path.extname(safeSource)
   const base = path.basename(safeSource, ext)
   const uniqueName = `${base}_${getCurrentTime()}${ext}`
   const newPath = path.join(tempDirectory, uniqueName)

   const contents = fs.readFileSync(safeSource)
   fs.writeFileSync(newPath, contents)
   core.debug(`moved contents from ${originalFilepath} to ${newPath}`)
   return newPath
}
```

Key changes:

- Source validated by `assertPathWithinWorkspace` before any read.
- Destination is **basename-only** under `tempDirectory` — caller-
  supplied directory structure is never reproduced under `RUNNER_TEMP`.
- Basename + `getCurrentTime()` uniquifier prevents collisions when two
  inputs share a filename (e.g. `a/svc.yaml` and `b/svc.yaml`),
  matching the existing pattern in `getNewTempManifestFileName`.
- The previous `mkdirSync(dirName, {recursive:true})` is removed —
  `tempDirectory` already exists and no subdirs are created.

### Entry-point validation

In `getFilesFromDirectoriesAndURLs`, apply `assertPathWithinWorkspace`
once on each user-supplied `fileName` _before_ `lstatSync` /
`readdirSync` / URL handling. The recursive descent in
`recurisveManifestGetter` then operates only on already-validated
absolute paths within the workspace, so discovered files are
intrinsically contained — no per-file re-check needed.

URL inputs (`isHttpUrl`) bypass containment because they don't read
from disk.

### Behavior on violation

**Hard error.** `assertPathWithinWorkspace` throws; the existing
try/catch in `getFilesFromDirectoriesAndURLs` re-throws as
`Exception occurred while reading the file ...`. The action step fails
loudly with a clear message. Silent skipping of a manifest a user asked
to deploy is worse than failing.

This is a **breaking change** for anyone whose workflow currently
relies on manifests outside `GITHUB_WORKSPACE`. That is the intended
hardening; document in CHANGELOG.

## Fix 2: `writeYamlFromURLToFile` Error Handling

Current code marks the `https.get` callback `async` without awaiting
anything, has no `error` handlers on `response` or the file-writer
stream, and on HTTP ≥ 400 calls `reject` but then falls through and
opens a write stream anyway.

### Rewrite

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
               response.resume() // drain
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
                     `outputting YAML contents from ${url} to ${targetPath}`
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

- Drop misleading `async` on the get callback.
- `return` after HTTP-error `reject` so the success path no longer runs.
- Drain the response on early reject.
- Add `error` listeners on `response` and `fileWriter` so socket / disk
  errors reject the promise instead of hanging it.
- Wrap `verification.error` (a string) in `new Error()` to keep stack
  traces sane.

## Testing

Tests live under `test/` (vitest). Add a new `test/unit/fileUtils.test.ts`
(or extend an existing file) covering:

### Path traversal

| Case                                                                 | Expected                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `moveFileToTmpDir('../etc/passwd.yaml')` with `GITHUB_WORKSPACE` set | throws "outside the workspace"                                           |
| `getFilesFromDirectoriesAndURLs(['../../.config/myapp/'])`           | throws                                                                   |
| `moveFileToTmpDir('<workspace>/manifests/svc.yaml')`                 | returns `<RUNNER_TEMP>/svc_<ts>.yaml`, file exists, contents match       |
| Symlink inside workspace → file outside workspace                    | throws (realpath check)                                                  |
| Two inputs sharing basename (`a/svc.yaml`, `b/svc.yaml`)             | both copied, distinct destination names, no overwrite                    |
| `GITHUB_WORKSPACE` unset                                             | no containment check, but destination is basename-only under RUNNER_TEMP |

### URL writer

| Case                    | Expected                                  |
| ----------------------- | ----------------------------------------- |
| HTTP 500 response       | promise rejects, no file written, no hang |
| Socket error mid-stream | promise rejects                           |
| Valid YAML body         | promise resolves with path, file exists   |
| Invalid YAML body       | promise rejects with verification error   |

Use temporary directories + `fs.symlinkSync` for the traversal setup;
mock `https.get` with `nock` or a local `http.createServer` for the URL
cases.

## Files Touched

- `src/utilities/fileUtils.ts` — both fixes.
- `test/unit/fileUtils.test.ts` — new or extended.
- `CHANGELOG.md` — security entry noting the breaking change.

## Commits

Two commits on `fix/manifest-path-traversal`:

1. `fix: confine manifest paths to workspace` — fix 1 + tests +
   CHANGELOG entry.
2. `fix: handle errors in writeYamlFromURLToFile` — fix 2 + tests.
