import {vi} from 'vitest'
import {getManifestObjects, GREEN_LABEL_VALUE} from './blueGreenHelper.js'
import * as bgHelper from './blueGreenHelper.js'
import {
   getUpdatedBlueGreenIngress,
   isIngressRouted,
   validateIngresses
} from './ingressBlueGreenHelper.js'
import {Kubectl} from '../../types/kubectl.js'
import * as fileHelper from '../../utilities/fileUtils.js'

const betaFilepath = ['test/unit/manifests/test-ingress.yml']
const ingressFilepath = ['test/unit/manifests/test-ingress-new.yml']
const kubectl = new Kubectl('')
vi.mock('../../types/kubectl')

describe('ingress blue green helpers', () => {
   let testObjects
   beforeEach(() => {
      vi.mocked(Kubectl).mockClear()
      testObjects = getManifestObjects(ingressFilepath)
      vi.spyOn(fileHelper, 'writeObjectsToFile').mockImplementationOnce(() => [
         ''
      ])
   })

   test('it should correctly classify ingresses', () => {
      expect(
         isIngressRouted(
            testObjects.ingressEntityList[0],
            testObjects.serviceNameMap
         )
      ).toBe(true)
      testObjects.ingressEntityList[0].spec.rules[0].http.paths = {}
      expect(
         isIngressRouted(
            testObjects.ingressEntityList[0],
            testObjects.serviceNameMap
         )
      ).toBe(false)
      expect(
         isIngressRouted(
            getManifestObjects(betaFilepath).ingressEntityList[0],
            testObjects.serviceNameMap
         )
      ).toBe(true)
   })

   test('it should correctly update ingresses', () => {
      const updatedIng = getUpdatedBlueGreenIngress(
         testObjects.ingressEntityList[0],
         testObjects.serviceNameMap,
         GREEN_LABEL_VALUE
      )
      expect(updatedIng.metadata.name).toBe('nginx-ingress')
      expect(updatedIng.metadata.labels['k8s.deploy.color']).toBe('green')
      expect(updatedIng.spec.rules[0].http.paths[0].backend.service.name).toBe(
         'nginx-service-green'
      )

      const oldIngObjects = getManifestObjects(betaFilepath)
      const oldIng = getUpdatedBlueGreenIngress(
         oldIngObjects.ingressEntityList[0],
         oldIngObjects.serviceNameMap,
         GREEN_LABEL_VALUE
      )
      expect(updatedIng.metadata.labels['k8s.deploy.color']).toBe('green')
      expect(updatedIng.spec.rules[0].http.paths[0].backend.service.name).toBe(
         'nginx-service-green'
      )
   })

   test('it should validate ingresses', async () => {
      // what if nothing gets returned from fetchResource?
      vi.spyOn(bgHelper, 'fetchResource').mockResolvedValue(null)
      let validResponse = await validateIngresses(
         kubectl,
         testObjects.ingressEntityList,
         testObjects.serviceNameMap
      )
      expect(validResponse.areValid).toBe(false)

      // test valid ingress
      let mockIngress = JSON.parse(
         JSON.stringify(testObjects.ingressEntityList[0])
      )
      mockIngress.spec.rules[0].http.paths[0].backend.service.name =
         'nginx-service-green'
      const mockLabels = new Map<string, string>()
      mockLabels[bgHelper.BLUE_GREEN_VERSION_LABEL] = GREEN_LABEL_VALUE
      mockIngress.metadata.labels = mockLabels
      vi.spyOn(bgHelper, 'fetchResource').mockImplementation(() =>
         Promise.resolve(mockIngress)
      )
      validResponse = await validateIngresses(
         kubectl,
         testObjects.ingressEntityList,
         testObjects.serviceNameMap
      )
      expect(validResponse.areValid).toBe(true)

      // test invalid labels
      mockIngress.metadata.labels[bgHelper.BLUE_GREEN_VERSION_LABEL] =
         bgHelper.NONE_LABEL_VALUE
      mockIngress.spec.rules[0].http.paths[0].backend.service.name =
         'nginx-service'
      validResponse = await validateIngresses(
         kubectl,
         testObjects.ingressEntityList,
         testObjects.serviceNameMap
      )
      expect(validResponse.areValid).toBe(false)

      // test missing fields
      mockIngress = {}
      validResponse = await validateIngresses(
         kubectl,
         testObjects.ingressEntityList,
         testObjects.serviceNameMap
      )
      expect(validResponse.areValid).toBe(false)
   })
})
