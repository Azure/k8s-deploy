import * as fileUtils from './fileUtils'
import * as manifestUpdateUtils from './manifestUpdateUtils'
import * as path from 'path'
import * as fs from 'fs'

describe('manifestUpdateUtils', () => {
   jest.spyOn(fileUtils, 'moveFileToTmpDir').mockImplementation((filename) => {
      return path.join('/tmp', filename)
   })
   jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
   jest.spyOn(fs, 'readFileSync').mockImplementation((filename) => {
      return 'test contents'
   })

   it('should place all files within the temp dir with the same path that they have in the repo', () => {
      const originalFilePaths: string[] = [
         'path/in/repo/test.txt',
         'path/deeper/in/repo/test.txt'
      ]
      const expected: string[] = [
         '/tmp/path/in/repo/test.txt',
         '/tmp/path/deeper/in/repo/test.txt'
      ]
      const newFilePaths =
         manifestUpdateUtils.moveFilesToTmpDir(originalFilePaths)
      expect(newFilePaths).toEqual(expected)
   })

   describe('updateImagesInK8sObject', () => {
      it('updates image in Deployment containers', () => {
         const obj: any = {
            kind: 'Deployment',
            spec: {template: {spec: {containers: [{image: 'nginx:old'}]}}}
         }
         manifestUpdateUtils['updateImagesInK8sObject'](
            obj,
            'nginx',
            'nginx:new'
         )
         expect(obj.spec.template.spec.containers[0].image).toBe('nginx:new')
      })

      it('updates image in CronJob containers', () => {
         const obj: any = {
            kind: 'CronJob',
            spec: {
               jobTemplate: {
                  spec: {
                     template: {
                        spec: {containers: [{image: 'busybox:old'}]}
                     }
                  }
               }
            }
         }
         manifestUpdateUtils['updateImagesInK8sObject'](
            obj,
            'busybox',
            'busybox:new'
         )
         expect(
            obj.spec.jobTemplate.spec.template.spec.containers[0].image
         ).toBe('busybox:new')
      })

      it('does not update image if name does not match', () => {
         const obj: any = {
            kind: 'Deployment',
            spec: {template: {spec: {containers: [{image: 'nginx:old'}]}}}
         }
         manifestUpdateUtils['updateImagesInK8sObject'](
            obj,
            'redis',
            'redis:new'
         )
         expect(obj.spec.template.spec.containers[0].image).toBe('nginx:old')
      })

      it('updates image in initContainers for Deployment', () => {
         const obj: any = {
            kind: 'Deployment',
            spec: {template: {spec: {initContainers: [{image: 'init:old'}]}}}
         }
         manifestUpdateUtils['updateImagesInK8sObject'](obj, 'init', 'init:new')
         expect(obj.spec.template.spec.initContainers[0].image).toBe('init:new')
      })

      it('updates image in initContainers for CronJob', () => {
         const obj: any = {
            kind: 'CronJob',
            spec: {
               jobTemplate: {
                  spec: {
                     template: {
                        spec: {initContainers: [{image: 'init:old'}]}
                     }
                  }
               }
            }
         }
         manifestUpdateUtils['updateImagesInK8sObject'](obj, 'init', 'init:new')
         expect(
            obj.spec.jobTemplate.spec.template.spec.initContainers[0].image
         ).toBe('init:new')
      })
   })
})
