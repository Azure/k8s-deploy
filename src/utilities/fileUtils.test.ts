import {getFilesFromDirectories} from './fileUtils'

import * as path from 'path'

describe('File utils', () => {
   it('detects files in nested directories and ignores non-manifest files and empty dirs', () => {
      const testPath = path.join('test', 'unit', 'manifests')
      const testSearch: string[] = getFilesFromDirectories([testPath])

      const expectedManifests = [
         'test/unit/manifests/manifest_test_dir/another_layer/deep-ingress.yaml',
         'test/unit/manifests/manifest_test_dir/another_layer/deep-service.yaml',
         'test/unit/manifests/manifest_test_dir/nested-test-service.yaml',
         'test/unit/manifests/test-ingress.yml',
         'test/unit/manifests/test-service.yml'
      ]

      // is there a more efficient way to test equality w random order?
      expect(testSearch).toHaveLength(5)
      expectedManifests.forEach((fileName) => {
         expect(testSearch).toContain(fileName)
      })
   })

   it('crashes when an invalid file is provided', () => {
      const badPath = path.join('test', 'unit', 'manifests', 'nonexistent.yaml')
      const goodPath = path.join(
         'test',
         'unit',
         'manifests',
         'manifest_test_dir'
      )

      expect(() => {
         getFilesFromDirectories([badPath, goodPath])
      }).toThrowError()
   })

   it("doesn't duplicate files when nested dir included", () => {
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
         getFilesFromDirectories([outerPath, fileAtOuter, innerPath])
      ).toHaveLength(5)
   })
})

// files that don't exist / nested files that don't exist / something else with non-manifest
// lots of combinations of pointing to a directory and non yaml/yaml file
// similarly named files in different folders
