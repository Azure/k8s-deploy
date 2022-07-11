import * as io from '@actions/io'
import {checkDockerPath} from './dockerUtils'

describe('docker utilities', () => {
   it('checks if docker is installed', async () => {
      // docker installed
      const path = 'path'
      jest.spyOn(io, 'which').mockImplementationOnce(async () => path)
      expect(() => checkDockerPath()).not.toThrow()

      // docker not installed
      jest.spyOn(io, 'which').mockImplementationOnce(async () => undefined)
      await expect(() => checkDockerPath()).rejects.toThrow()
   })
})
