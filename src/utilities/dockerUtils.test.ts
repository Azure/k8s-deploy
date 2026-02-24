import {vi} from 'vitest'
vi.mock('@actions/io')

import * as io from '@actions/io'
import {checkDockerPath} from './dockerUtils.js'

describe('docker utilities', () => {
   it('checks if docker is installed', async () => {
      // docker installed
      const path = 'path'
      vi.spyOn(io, 'which').mockImplementationOnce(async () => path)
      expect(() => checkDockerPath()).not.toThrow()

      // docker not installed
      vi.spyOn(io, 'which').mockImplementationOnce(async () => {
         throw new Error('not found')
      })
      await expect(() => checkDockerPath()).rejects.toThrow()
   })
})
