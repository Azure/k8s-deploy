import * as core from '@actions/core'
import {ExecOutput} from '@actions/exec'
import {checkForErrors} from './kubectlUtils'

describe('Kubectl utils', () => {
   it('checks for errors', () => {
      const success: ExecOutput = {stderr: '', stdout: 'success', exitCode: 0}
      const successWithStderr: ExecOutput = {
         stderr: 'error',
         stdout: '',
         exitCode: 0
      }
      const failWithExitCode: ExecOutput = {
         stderr: '',
         stdout: '',
         exitCode: 1
      }
      const failWithExitWithStderr: ExecOutput = {
         stderr: 'error',
         stdout: '',
         exitCode: 2
      }

      // with throw behavior
      expect(() => checkForErrors([success])).not.toThrow()
      expect(() => checkForErrors([successWithStderr])).not.toThrow()
      expect(() => checkForErrors([success, successWithStderr])).not.toThrow()
      expect(() => checkForErrors([failWithExitCode])).toThrow()
      expect(() => checkForErrors([failWithExitWithStderr])).toThrow()
      expect(() => checkForErrors([success, failWithExitCode])).toThrow()
      expect(() =>
         checkForErrors([successWithStderr, failWithExitCode])
      ).toThrow()
      expect(() =>
         checkForErrors([success, successWithStderr, failWithExitCode])
      ).toThrow()
      expect(() =>
         checkForErrors([success, successWithStderr, failWithExitWithStderr])
      ).toThrow()

      // with warn behavior
      jest.spyOn(core, 'warning').mockImplementation(() => {})
      let warningCalls = 0
      expect(() => checkForErrors([success], true)).not.toThrow()
      expect(core.warning).toBeCalledTimes(warningCalls)

      expect(() => checkForErrors([successWithStderr], true)).not.toThrow()
      expect(core.warning).toBeCalledTimes(++warningCalls)

      expect(() =>
         checkForErrors([success, successWithStderr], true)
      ).not.toThrow()
      expect(core.warning).toBeCalledTimes(++warningCalls)

      expect(() => checkForErrors([failWithExitCode], true)).not.toThrow()
      expect(core.warning).toBeCalledTimes(++warningCalls)

      expect(() => checkForErrors([failWithExitWithStderr], true)).not.toThrow()
      expect(core.warning).toBeCalledTimes(++warningCalls)
   })
})
