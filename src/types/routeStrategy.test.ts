import {parseRouteStrategy, RouteStrategy} from './routeStrategy'

describe('Route strategy type', () => {
   test('it has required values', () => {
      const vals = <any>Object.values(RouteStrategy)
      expect(vals.includes('ingress')).toBe(true)
      expect(vals.includes('smi')).toBe(true)
      expect(vals.includes('service')).toBe(true)
   })

   test('it can parse valid values from a string', () => {
      expect(parseRouteStrategy('ingress')).toBe(RouteStrategy.INGRESS)
      expect(parseRouteStrategy('Ingress')).toBe(RouteStrategy.INGRESS)
      expect(parseRouteStrategy('ingresS')).toBe(RouteStrategy.INGRESS)
      expect(parseRouteStrategy('INGRESS')).toBe(RouteStrategy.INGRESS)
   })

   test("it will return undefined if it can't parse values from a string", () => {
      expect(parseRouteStrategy('invalid')).toBe(undefined)
      expect(parseRouteStrategy('unsupportedType')).toBe(undefined)
   })
})
