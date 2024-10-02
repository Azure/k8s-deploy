import * as fileUtils from './fileUtils'

import * as yaml from 'js-yaml'
import * as fs from 'fs'
import * as path from 'path'
import { K8sObject } from '../types/k8sObject';

const sampleYamlUrl =
   'https://raw.githubusercontent.com/kubernetes/website/main/content/en/examples/controllers/nginx-deployment.yaml'
describe('File utils', () => {
   test('correctly parses a yaml file from a URL', async () => {
      const tempFile = await fileUtils.writeYamlFromURLToFile(sampleYamlUrl, 0)
      const fileContents = fs.readFileSync(tempFile).toString()
      const inputObjects: K8sObject[] = yaml.loadAll(fileContents) as K8sObject[]; // Type assertion here

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
         'test/unit/manifests/test-service.yml'
      ]

      expect(testSearch).toHaveLength(8)
      expectedManifests.forEach((fileName) => {
         if (fileName.startsWith('test/unit')) {
            expect(testSearch).toContain(fileName)
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

      expect(
         fileUtils.getFilesFromDirectoriesAndURLs([badPath, goodPath])
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
         await fileUtils.getFilesFromDirectoriesAndURLs([
            outerPath,
            fileAtOuter,
            innerPath
         ])
      ).toHaveLength(7)
   })

   it('throws an error for an invalid URL', async () => {
      const badUrl = 'https://www.github.com'
      await expect(
         fileUtils.writeYamlFromURLToFile(badUrl, 0)
      ).rejects.toBeTruthy()
   })
})

describe('moving files to temp', () => {
   it('correctly moves the contents of a file to the temporary directory', () => {
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
      jest.spyOn(fs, 'readFileSync').mockImplementation((filename) => {
         return 'test contents'
      })
      const originalFilePath = path.join('path', 'in', 'repo')

      const output = fileUtils.moveFileToTmpDir(originalFilePath)

      expect(output).toEqual(
         path.join(fileUtils.getTempDirectory(), '/path/in/repo')
      )
   })
})
