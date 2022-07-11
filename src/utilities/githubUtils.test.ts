import {
   getNormalizedPath,
   isHttpUrl,
   normalizeWorkflowStrLabel
} from './githubUtils'

describe('Github utils', () => {
   it('normalizes workflow string labels', () => {
      const workflowsPath = '.github/workflows/'

      const path = 'test/path/test'
      expect(normalizeWorkflowStrLabel(workflowsPath + path)).toBe(path)
      expect(normalizeWorkflowStrLabel(path)).toBe(path)
      expect(normalizeWorkflowStrLabel(path + workflowsPath)).toBe(
         path + workflowsPath
      )
      expect(normalizeWorkflowStrLabel(path + ' ' + path)).toBe(
         path + '_' + path
      )
   })

   it('normalizes path', () => {
      const httpUrl = 'http://www.test.com'
      expect(getNormalizedPath(httpUrl)).toBe(httpUrl)

      const httpsUrl = 'https://www.test.com'
      expect(getNormalizedPath(httpsUrl)).toBe(httpsUrl)

      const repo = 'gh_repo'
      const sha = 'gh_sha'
      const path = 'path'
      process.env.GITHUB_REPOSITORY = repo
      process.env.GITHUB_SHA = sha
      expect(getNormalizedPath(path)).toBe(
         `https://github.com/${repo}/blob/${sha}/${path}`
      )
   })

   it('checks if url is http', () => {
      expect(isHttpUrl('www.test.com')).toBe(false)
      expect(isHttpUrl('http.test.com')).toBe(false)
      expect(isHttpUrl('http:.test.com')).toBe(false)
      expect(isHttpUrl('http:/.test.com')).toBe(false)

      expect(isHttpUrl('https://www.test.com')).toBe(true)
      expect(isHttpUrl('http://wwww.test.com')).toBe(true)
   })
})
