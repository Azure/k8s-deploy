import {
   getFilesFromDirectoriesAndURLs,
   getTempDirectory,
   urlFileKind,
   writeYamlFromURLToFile
} from './fileUtils'

import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as path from 'path'
import {succeeded} from '../types/errorable'

const sampleYamlUrl =
   'https://raw.githubusercontent.com/kubernetes/website/main/content/en/examples/controllers/nginx-deployment.yaml'
describe('File utils', () => {
   test('correctly parses a yaml file from a URL', async () => {
      const tempFile = await writeYamlFromURLToFile(sampleYamlUrl, 0)
      const fileContents = fs.readFileSync(tempFile).toString()
      const inputObjects = yaml.safeLoadAll(fileContents)
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
         getFilesFromDirectoriesAndURLs([testPath, badUrl])
      ).rejects.toThrow()
   })

   it('detects files in nested directories and ignores non-manifest files and empty dirs', async () => {
      const testPath = path.join('test', 'unit', 'manifests')
      const testSearch: string[] = await getFilesFromDirectoriesAndURLs([
         testPath,
         sampleYamlUrl
      ])

      const expectedManifests = [
         'test/unit/manifests/manifest_test_dir/another_layer/deep-ingress.yaml',
         'test/unit/manifests/manifest_test_dir/another_layer/deep-service.yaml',
         'test/unit/manifests/manifest_test_dir/nested-test-service.yaml',
         'test/unit/manifests/test-ingress.yml',
         'test/unit/manifests/test-ingress-new.yml',
         'test/unit/manifests/test-service.yml'
      ]

      // is there a more efficient way to test equality w random order?
      expect(testSearch).toHaveLength(8)
      expectedManifests.forEach((fileName) => {
         if (fileName.startsWith('test/unit')) {
            expect(testSearch).toContain(fileName)
         } else {
            expect(fileName.includes(urlFileKind)).toBe(true)
            expect(fileName.startsWith(getTempDirectory()))
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

      expect(
         getFilesFromDirectoriesAndURLs([badPath, goodPath])
      ).rejects.toThrowError()
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
         await getFilesFromDirectoriesAndURLs([
            outerPath,
            fileAtOuter,
            innerPath
         ])
      ).toHaveLength(7)
   })

   it('throws an error for an invalid URL', async () => {
      const badUrl = 'https://www.github.com'
      await expect(writeYamlFromURLToFile(badUrl, 0)).rejects.toBeTruthy()
   })
})
