import {vi} from 'vitest'
vi.mock('fs')

import * as fileUtils from './fileUtils.js'
import * as manifestUpdateUtils from './manifestUpdateUtils.js'
import * as path from 'path'
import * as fs from 'fs'

describe('manifestUpdateUtils', () => {
   vi.spyOn(fileUtils, 'moveFileToTmpDir').mockImplementation((filename) => {
      return path.join('/tmp', filename)
   })
   vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
   vi.spyOn(fs, 'readFileSync').mockImplementation((filename) => {
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
