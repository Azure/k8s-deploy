import * as manifestStabilityUtils from './manifestStabilityUtils'
import {Kubectl} from '../types/kubectl'

describe('manifestStabilityUtils', () => {
   const kc = new Kubectl('')
   const resources = [
      {
         type: 'deployment',
         name: 'test',
         namespace: 'default'
      }
   ]
   const resourceType = 'microsoft.containerservice/fleets'

   it('should return immediately if the resource type is microsoft.containerservice/fleets', async () => {
      const spy = jest.spyOn(manifestStabilityUtils, 'checkManifestStability')
      const checkRolloutStatusSpy = jest.spyOn(kc, 'checkRolloutStatus')
      await manifestStabilityUtils.checkManifestStability(kc, resources, resourceType)

      expect(checkRolloutStatusSpy).not.toHaveBeenCalled()
      expect(spy).toHaveReturned()
   })
})