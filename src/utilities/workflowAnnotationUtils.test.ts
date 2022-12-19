import {
   cleanLabel,
   removeInvalidLabelCharacters,
   VALID_LABEL_REGEX
} from '../utilities/workflowAnnotationUtils'

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
         expect(cleanLabel(label)).toEqual('github-workflow-file')

         let removedInvalidChars = removeInvalidLabelCharacters(label)

         const regexResult = VALID_LABEL_REGEX.exec(removedInvalidChars)
         expect(regexResult).toBe(null)
      })
   })
})
