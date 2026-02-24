import {
   getImagePullSecrets,
   setImagePullSecrets
} from './manifestPullSecretUtils.js'
import {updateSpecLabels} from './manifestSpecLabelUtils.js'
import {getReplicaCount} from './manifestUpdateUtils.js'
import * as yaml from 'js-yaml'
import * as fs from 'fs'
import {isWorkloadEntity, isDeploymentEntity} from '../types/kubernetesTypes.js'

describe('ScaledJob Support', () => {
   let scaledJobObject: any

   beforeEach(() => {
      const fileContents = fs.readFileSync(
         'test/unit/manifests/test-scaledjob.yml'
      )
      scaledJobObject = yaml.load(fileContents.toString()) as any
   })

   describe('Image Pull Secrets', () => {
      it('should get image pull secrets from ScaledJob', () => {
         const secrets = getImagePullSecrets(scaledJobObject)
         expect(secrets).toEqual([{name: 'test-secret'}])
      })

      it('should set image pull secrets in ScaledJob', () => {
         const newSecrets = [{name: 'new-secret'}, {name: 'another-secret'}]
         setImagePullSecrets(scaledJobObject, newSecrets)

         const updatedSecrets = getImagePullSecrets(scaledJobObject)
         expect(updatedSecrets).toEqual(newSecrets)
      })
   })

   describe('Spec Labels', () => {
      it('should update spec labels in ScaledJob', () => {
         const newLabels = new Map<string, string>()
         newLabels['environment'] = 'test'
         newLabels['version'] = '1.0.0'

         updateSpecLabels(scaledJobObject, newLabels, false)

         const updatedLabels =
            scaledJobObject.spec.jobTargetRef.template.metadata.labels
         expect(updatedLabels['app']).toBe('test-scaledjob') // original label
         expect(updatedLabels['environment']).toBe('test') // new label
         expect(updatedLabels['version']).toBe('1.0.0') // new label
      })
   })

   describe('Replica Count', () => {
      it('should return 0 for ScaledJob replica count', () => {
         const replicaCount = getReplicaCount(scaledJobObject)
         expect(replicaCount).toBe(0)
      })
   })

   describe('Workload Classification', () => {
      it('should classify ScaledJob as workload entity', () => {
         expect(isWorkloadEntity('ScaledJob')).toBe(true)
         expect(isWorkloadEntity('scaledjob')).toBe(true)
      })

      it('should not classify ScaledJob as deployment entity', () => {
         expect(isDeploymentEntity('scaledjob')).toBe(false)
         expect(isDeploymentEntity('ScaledJob')).toBe(false)
      })
   })
})
