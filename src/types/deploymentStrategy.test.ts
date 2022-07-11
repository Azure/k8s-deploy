import {DeploymentStrategy, parseDeploymentStrategy} from './deploymentStrategy'

describe('Deployment strategy type', () => {
   test('it has required values', () => {
      const vals = <any>Object.values(DeploymentStrategy)
      expect(vals.includes('canary')).toBe(true)
      expect(vals.includes('blue-green')).toBe(true)
      expect(vals.includes('basic')).toBe(true)
   })

   test('it can parse valid values from a string', () => {
      expect(parseDeploymentStrategy('blue-green')).toBe(
         DeploymentStrategy.BLUE_GREEN
      )
      expect(parseDeploymentStrategy('Blue-green')).toBe(
         DeploymentStrategy.BLUE_GREEN
      )
      expect(parseDeploymentStrategy('BLUE-GREEN')).toBe(
         DeploymentStrategy.BLUE_GREEN
      )
      expect(parseDeploymentStrategy('blue-greeN')).toBe(
         DeploymentStrategy.BLUE_GREEN
      )
   })
})
