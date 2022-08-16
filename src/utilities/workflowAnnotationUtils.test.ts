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
   })
})
