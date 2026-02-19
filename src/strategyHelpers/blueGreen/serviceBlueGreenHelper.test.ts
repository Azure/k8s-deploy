import {vi} from 'vitest'
import * as core from '@actions/core'
import {
   BLUE_GREEN_VERSION_LABEL,
   getManifestObjects,
   GREEN_LABEL_VALUE
} from './blueGreenHelper.js'
import * as bgHelper from './blueGreenHelper.js'
import {Kubectl} from '../../types/kubectl.js'
import {
   getServiceSpecLabel,
   getUpdatedBlueGreenService,
   validateServicesState
} from './serviceBlueGreenHelper.js'

let testObjects
const ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
vi.mock('../../types/kubectl')
const kubectl = new Kubectl('')

describe('blue/green service helper tests', () => {
   beforeEach(() => {
      vi.mocked(Kubectl).mockClear()
      testObjects = getManifestObjects(ingressFilepath)
   })

   test('getUpdatedBlueGreenService', () => {
      const newService = getUpdatedBlueGreenService(
         testObjects.serviceEntityList[0],
         GREEN_LABEL_VALUE
      )
      expect(newService.metadata.labels[BLUE_GREEN_VERSION_LABEL]).toBe(
         GREEN_LABEL_VALUE
      )
      expect(newService.spec.selector[BLUE_GREEN_VERSION_LABEL]).toBe(
         GREEN_LABEL_VALUE
      )
   })

   test('validateServicesState', async () => {
      const mockLabels = new Map<string, string>()
      mockLabels[BLUE_GREEN_VERSION_LABEL] = bgHelper.GREEN_LABEL_VALUE
      const mockSelectors = new Map<string, string>()
      mockSelectors[BLUE_GREEN_VERSION_LABEL] = GREEN_LABEL_VALUE
      vi.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
         Promise.resolve({
            kind: 'Service',
            spec: {selector: mockSelectors},
            metadata: {labels: mockLabels, name: 'nginx-service-green'}
         })
      )
      expect(
         await validateServicesState(kubectl, testObjects.serviceEntityList)
      ).toBe(true)
   })

   test('getServiceSpecLabel', () => {
      testObjects.serviceEntityList[0].spec.selector[BLUE_GREEN_VERSION_LABEL] =
         GREEN_LABEL_VALUE

      expect(getServiceSpecLabel(testObjects.serviceEntityList[0])).toBe(
         GREEN_LABEL_VALUE
      )
   })
})
