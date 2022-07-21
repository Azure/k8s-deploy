import {
   cleanLabel,
   prefixObjectKeys
} from '../utilities/workflowAnnotationUtils'

describe('WorkflowAnnotationUtils', () => {
   describe('prefixObjectKeys', () => {
      it('should prefix an object with a given prefix', () => {
         const obj = {
            foo: 'bar',
            baz: 'qux'
         }
         const prefix = 'prefix.'
         const expected = {
            'prefix.foo': 'bar',
            'prefix.baz': 'qux'
         }
         expect(prefixObjectKeys(obj, prefix)).toEqual(expected)
      })
   })

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
   })
})
