import * as fileUtils from './fileUtils'
import * as manifestStabilityUtils from './manifestStabilityUtils'
import * as path from 'path'
import * as fs from 'fs'
import {before} from 'node:test'
import {Kubectl} from '../types/kubectl'

describe('manifestStabilityUtils', () => {

   const resourceType = 'microsoft.containerservice/fleets'
   const resources = [
      {
         type: 'deployment',
         name: 'test',
         namespace: 'default'
      }
   ]
   const kc = new Kubectl('')

   it('should return immediately if the resource type is microsoft.containerservice/fleets', async () => {
      const spy = jest.spyOn(manifestStabilityUtils, 'checkManifestStability')
      const checkRolloutStatusSpy = jest.spyOn(kc, 'checkRolloutStatus')

      await manifestStabilityUtils.checkManifestStability(kc, resources, resourceType)

      expect(checkRolloutStatusSpy).not.toHaveBeenCalled()
      expect(spy).toHaveReturned()
   })


})