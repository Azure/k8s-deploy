import {cleanLabel} from '../utilities/workflowAnnotationUtils'

describe('WorkflowAnnotationUtils', () => {
   describe('cleanLabel', () => {
      it('should clean label', () => {
         const alreadyClean = 'alreadyClean'
         expect(cleanLabel(alreadyClean)).toEqual(alreadyClean)
         expect(cleanLabel('.startInvalid')).toEqual('startInvalid')
         expect(cleanLabel('with%S0ME&invalid#chars')).toEqual(
            'withS0MEinvalidchars'
         )
         expect(cleanLabel('with⚒️emoji')).toEqual('withemoji')
      })
      it('should remove slashes from label', () => {
         expect(
            cleanLabel('Workflow Name / With Slashes / And Spaces')
         ).toEqual('Workflow_Name_-_With_Slashes_-_And_Spaces')
      })
      it('should return a blank string when regex fails (https://github.com/Azure/k8s-deploy/issues/266)', () => {
         const label = '持续部署'
         expect(cleanLabel(label)).toEqual('')

         let removedInvalidChars = label
            .replace(/\s/gi, '_')
            .replace(/[\/\\\|]/gi, '-')
            .replace(/[^-A-Za-z0-9_.]/gi, '')

         const regex = /([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9]/
         const regexResult = regex.exec(removedInvalidChars)
         expect(regexResult).toBe(null)
      })
   })
})
