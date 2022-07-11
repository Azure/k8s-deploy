import {Action, parseAction} from './action'

describe('Action type', () => {
   test('it has required values', () => {
      const vals = <any>Object.values(Action)
      expect(vals.includes('deploy')).toBe(true)
      expect(vals.includes('promote')).toBe(true)
      expect(vals.includes('reject')).toBe(true)
   })

   test('it can parse valid values from a string', () => {
      expect(parseAction('deploy')).toBe(Action.DEPLOY)
      expect(parseAction('Deploy')).toBe(Action.DEPLOY)
      expect(parseAction('DEPLOY')).toBe(Action.DEPLOY)
      expect(parseAction('deploY')).toBe(Action.DEPLOY)
   })

   test("it will return undefined if it can't parse values from a string", () => {
      expect(parseAction('invalid')).toBe(undefined)
      expect(parseAction('unsupportedType')).toBe(undefined)
   })
})
