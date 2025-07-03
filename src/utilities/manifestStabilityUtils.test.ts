import * as manifestStabilityUtils from './manifestStabilityUtils'
import {Kubectl} from '../types/kubectl'
import {ResourceTypeFleet, ResourceTypeManagedCluster} from '../actions/deploy'
import {ExecOutput} from '@actions/exec'
import {exitCode, stdout} from 'process'

describe('manifestStabilityUtils', () => {
   const kc = new Kubectl('')
   const resources = [
      {
         type: 'deployment',
         name: 'test',
         namespace: 'default'
      }
   ]

   it('should return immediately if the resource type is fleet', async () => {
      const spy = jest.spyOn(manifestStabilityUtils, 'checkManifestStability')
      const checkRolloutStatusSpy = jest.spyOn(kc, 'checkRolloutStatus')
      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeFleet
      )

      expect(checkRolloutStatusSpy).not.toHaveBeenCalled()
      expect(spy).toHaveReturned()
   })

   it('should run fully if the resource type is managedCluster', async () => {
      const spy = jest.spyOn(manifestStabilityUtils, 'checkManifestStability')
      const checkRolloutStatusSpy = jest
         .spyOn(kc, 'checkRolloutStatus')
         .mockImplementation(() => {
            return new Promise<ExecOutput>((resolve, reject) => {
               resolve({
                  exitCode: 0,
                  stderr: '',
                  stdout: ''
               })
            })
         })
      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster
      )

      expect(checkRolloutStatusSpy).toHaveBeenCalled()
      expect(spy).toHaveReturned()
   })

   it('should pass timeout to checkRolloutStatus when provided', async () => {
      const timeout = '300s'
      const checkRolloutStatusSpy = jest
         .spyOn(kc, 'checkRolloutStatus')
         .mockImplementation(() => {
            return new Promise<ExecOutput>((resolve, reject) => {
               resolve({
                  exitCode: 0,
                  stderr: '',
                  stdout: ''
               })
            })
         })

      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster,
         timeout
      )

      expect(checkRolloutStatusSpy).toHaveBeenCalledWith(
         'deployment',
         'test',
         'default',
         timeout
      )
   })

   it('should call checkRolloutStatus without timeout when not provided', async () => {
      const checkRolloutStatusSpy = jest
         .spyOn(kc, 'checkRolloutStatus')
         .mockImplementation(() => {
            return new Promise<ExecOutput>((resolve, reject) => {
               resolve({
                  exitCode: 0,
                  stderr: '',
                  stdout: ''
               })
            })
         })

      await manifestStabilityUtils.checkManifestStability(
         kc,
         resources,
         ResourceTypeManagedCluster
      )

      expect(checkRolloutStatusSpy).toHaveBeenCalledWith(
         'deployment',
         'test',
         'default',
         undefined
      )
   })
})
