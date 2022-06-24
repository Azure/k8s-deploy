import {parseTrafficSplitMethod, TrafficSplitMethod} from './trafficSplitMethod'

describe('Traffic split method type', () => {
   test('it has required values', () => {
      const vals = <any>Object.values(TrafficSplitMethod)
      expect(vals.includes('pod')).toBe(true)
      expect(vals.includes('smi')).toBe(true)
   })

   test('it can parse valid values from a string', () => {
      expect(parseTrafficSplitMethod('pod')).toBe(TrafficSplitMethod.POD)
      expect(parseTrafficSplitMethod('Pod')).toBe(TrafficSplitMethod.POD)
      expect(parseTrafficSplitMethod('poD')).toBe(TrafficSplitMethod.POD)
      expect(parseTrafficSplitMethod('POD')).toBe(TrafficSplitMethod.POD)
   })

   test("it will return undefined if it can't parse values from a string", () => {
      expect(parseTrafficSplitMethod('invalid')).toBe(undefined)
      expect(parseTrafficSplitMethod('unsupportedType')).toBe(undefined)
   })
})
