import {DockerExec} from './docker'
import * as actions from '@actions/exec'

const dockerPath = 'dockerPath'
const image = 'image'
const args = ['arg1', 'arg2', 'arg3']

describe('Docker class', () => {
   const docker = new DockerExec(dockerPath)

   describe('with a success exec return', () => {
      const execReturn = {exitCode: 0, stdout: 'Output', stderr: ''}

      beforeEach(() => {
         jest.spyOn(actions, 'getExecOutput').mockImplementation(async () => {
            return execReturn
         })
      })

      test('pulls an image', async () => {
         await docker.pull(image, args)
         expect(actions.getExecOutput).toBeCalledWith(
            dockerPath,
            ['pull', image, ...args],
            {silent: false}
         )
      })

      test('pulls an image silently', async () => {
         await docker.pull(image, args, true)
         expect(actions.getExecOutput).toBeCalledWith(
            dockerPath,
            ['pull', image, ...args],
            {silent: true}
         )
      })

      test('inspects a docker image', async () => {
         const result = await docker.inspect(image, args)
         expect(result).toBe(execReturn.stdout)
         expect(actions.getExecOutput).toBeCalledWith(
            dockerPath,
            ['inspect', image, ...args],
            {silent: false}
         )
      })

      test('inspects a docker image silently', async () => {
         const result = await docker.inspect(image, args, true)
         expect(result).toBe(execReturn.stdout)
         expect(actions.getExecOutput).toBeCalledWith(
            dockerPath,
            ['inspect', image, ...args],
            {silent: true}
         )
      })
   })

   describe('with an unsuccessful exec return code', () => {
      const execReturn = {exitCode: 3, stdout: '', stderr: ''}

      beforeEach(() => {
         jest.spyOn(actions, 'getExecOutput').mockImplementation(async () => {
            return execReturn
         })
      })

      test('pulls an image', async () => {
         await expect(docker.pull(image, args)).rejects.toThrow()
      })

      test('inspects a docker image', async () => {
         const result = await expect(
            docker.inspect(image, args)
         ).rejects.toThrow()
      })
   })

   describe('with an unsuccessful exec return code', () => {
      const execReturn = {exitCode: 0, stdout: '', stderr: 'Output'}

      beforeEach(() => {
         jest.spyOn(actions, 'getExecOutput').mockImplementation(async () => {
            return execReturn
         })
      })

      test('pulls an image', async () => {
         await expect(docker.pull(image, args)).rejects.toThrow()
      })

      test('inspects a docker image', async () => {
         const result = await expect(
            docker.inspect(image, args)
         ).rejects.toThrow()
      })
   })
})
