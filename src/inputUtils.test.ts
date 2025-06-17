import {parseResourceTypeInput} from './inputUtils'
import {ResourceTypeFleet, ResourceTypeManagedCluster} from './actions/deploy'

describe('InputUtils', () => {
   describe('parseResourceTypeInput', () => {
      it('should extract fleet exact match resource type', () => {
         expect(
            parseResourceTypeInput('Microsoft.ContainerService/fleets')
         ).toEqual(ResourceTypeFleet)
      })
      it('should match fleet case-insensitively', () => {
         expect(
            parseResourceTypeInput('Microsoft.containerservice/fleets')
         ).toEqual(ResourceTypeFleet)
      })
      it('should match managed cluster case-insensitively', () => {
         expect(
            parseResourceTypeInput('Microsoft.containerservice/MAnaGedClusterS')
         ).toEqual(ResourceTypeManagedCluster)
      })
      it('should error on unexpected values', () => {
         expect(() => {
            parseResourceTypeInput('icrosoft.ContainerService/ManagedCluster')
         }).toThrow()
         expect(() => {
            parseResourceTypeInput('wrong-value')
         }).toThrow()
      })
   })
})
