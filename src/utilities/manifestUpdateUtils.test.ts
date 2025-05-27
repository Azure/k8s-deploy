import * as fileUtils from './fileUtils'
import * as manifestUpdateUtils from './manifestUpdateUtils'
import * as path from 'path'
import * as fs from 'fs'

describe('manifestUpdateUtils', () => {
   jest.spyOn(fileUtils, 'moveFileToTmpDir').mockImplementation((filename) => {
      return path.join('/tmp', filename)
   })
   jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
   jest.spyOn(fs, 'readFileSync').mockImplementation((filename) => {
      return 'test contents'
   })

   it('should place all files within the temp dir with the same path that they have in the repo', () => {
      const originalFilePaths: string[] = [
         'path/in/repo/test.txt',
         'path/deeper/in/repo/test.txt'
      ]
      const expected: string[] = [
         '/tmp/path/in/repo/test.txt',
         '/tmp/path/deeper/in/repo/test.txt'
      ]
      const newFilePaths =
         manifestUpdateUtils.moveFilesToTmpDir(originalFilePaths)
      expect(newFilePaths).toEqual(expected)
   })
})
