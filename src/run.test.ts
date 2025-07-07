import * as core from '@actions/core'

// Mock @actions/core before any other imports to prevent side effects
jest.mock('@actions/core', () => ({
   getInput: jest.fn(),
   debug: jest.fn(),
   warning: jest.fn(),
   setFailed: jest.fn()
}))

// Mock other problematic modules
jest.mock('./inputUtils', () => ({}))
jest.mock('./actions/deploy', () => ({}))

import {validateTimeoutDuration} from './run'

const mockCore = core as jest.Mocked<typeof core>

// Test constants to follow DRY principle
const VALID_TIMEOUTS = {
   withUnits: ['30s', '5m', '1h', '500ms'],
   decimals: ['1.5h', '2.5m', '30.5s'],
   caseInsensitive: ['30S', '5M', '1H', '500MS'],
   expectedLowercase: ['30s', '5m', '1h', '500ms'],
   bareNumbers: ['5', '10', '1.5'],
   expectedWithMinutes: ['5m', '10m', '1.5m'],
   whitespace: ['  30s  ', '\t5m\n', ' 10 '],
   expectedTrimmed: ['30s', '5m', '10m'],
   rangeValid: ['1ms', '1s', '1m', '1h', '24h'],
   edgeCases: ['1440m', '86400s'] // exactly 24h
}

const INVALID_TIMEOUTS = {
   badFormats: ['foobar', '12blah', 'abc123', '5x', ''],
   negative: ['-5m', '-1'],
   zero: ['0', '0s', '0m'],
   belowMin: ['0.5ms', '0.0001s'],
   aboveMax: ['25h', '1441m', '86401s']
}

const ERROR_MESSAGES = {
   invalidFormat: (input: string) => `Invalid timeout format: "${input}"`,
   notPositive: (input: string) => `Timeout must be positive: "${input}"`,
   outOfRange: (input: string) =>
      `Timeout out of range (1ms to 24h): "${input}"`
}

// Helper functions to reduce repetition
const expectValidTimeout = (input: string, expected: string) => {
   expect(validateTimeoutDuration(input)).toBe(expected)
}

const expectInvalidTimeout = (input: string, errorMessage: string) => {
   expect(() => validateTimeoutDuration(input)).toThrow(errorMessage)
}

describe('validateTimeoutDuration', () => {
   beforeEach(() => {
      jest.clearAllMocks()
   })

   describe('valid timeout formats', () => {
      test('accepts number with valid units', () => {
         VALID_TIMEOUTS.withUnits.forEach((timeout) => {
            expectValidTimeout(timeout, timeout)
         })
      })

      test('accepts decimal numbers with units', () => {
         VALID_TIMEOUTS.decimals.forEach((timeout) => {
            expectValidTimeout(timeout, timeout)
         })
      })

      test('handles case insensitive units', () => {
         VALID_TIMEOUTS.caseInsensitive.forEach((timeout, index) => {
            expectValidTimeout(timeout, VALID_TIMEOUTS.expectedLowercase[index])
         })
      })

      test('assumes minutes for bare numbers', () => {
         VALID_TIMEOUTS.bareNumbers.forEach((timeout, index) => {
            expectValidTimeout(
               timeout,
               VALID_TIMEOUTS.expectedWithMinutes[index]
            )
         })
      })

      test('trims whitespace', () => {
         VALID_TIMEOUTS.whitespace.forEach((timeout, index) => {
            expectValidTimeout(timeout, VALID_TIMEOUTS.expectedTrimmed[index])
         })
      })

      test('logs assumption for bare numbers', () => {
         validateTimeoutDuration('5')
         expect(mockCore.debug).toHaveBeenCalledWith(
            'No unit specified for timeout "5", assuming minutes'
         )

         jest.clearAllMocks()
         validateTimeoutDuration('30s')
         expect(mockCore.debug).not.toHaveBeenCalled()
      })
   })

   describe('invalid timeout formats', () => {
      test('rejects invalid formats', () => {
         INVALID_TIMEOUTS.badFormats.forEach((timeout) => {
            expectInvalidTimeout(timeout, ERROR_MESSAGES.invalidFormat(timeout))
         })
      })

      test('rejects negative values', () => {
         INVALID_TIMEOUTS.negative.forEach((timeout) => {
            expectInvalidTimeout(timeout, ERROR_MESSAGES.invalidFormat(timeout))
         })
      })

      test('rejects zero values', () => {
         INVALID_TIMEOUTS.zero.forEach((timeout) => {
            expectInvalidTimeout(timeout, ERROR_MESSAGES.notPositive(timeout))
         })
      })
   })

   describe('range validation', () => {
      test('accepts values within reasonable range', () => {
         VALID_TIMEOUTS.rangeValid.forEach((timeout) => {
            expectValidTimeout(timeout, timeout)
         })
      })

      test('rejects values below minimum (1ms)', () => {
         INVALID_TIMEOUTS.belowMin.forEach((timeout) => {
            expectInvalidTimeout(timeout, ERROR_MESSAGES.outOfRange(timeout))
         })
      })

      test('rejects values above maximum (24h)', () => {
         INVALID_TIMEOUTS.aboveMax.forEach((timeout) => {
            expectInvalidTimeout(timeout, ERROR_MESSAGES.outOfRange(timeout))
         })
      })

      test('accepts edge case values', () => {
         VALID_TIMEOUTS.edgeCases.forEach((timeout) => {
            expectValidTimeout(timeout, timeout)
         })
      })
   })

   describe('edge cases', () => {
      test('handles very small decimal values', () => {
         expectValidTimeout('0.001s', '0.001s') // exactly 1ms
         expectValidTimeout('0.0167m', '0.0167m') // ~1s
      })

      test('handles large valid values', () => {
         expectValidTimeout('23.999h', '23.999h')
         expectValidTimeout('1439m', '1439m')
      })

      test('preserves exact input formatting for valid inputs', () => {
         expectValidTimeout('5.0m', '5m') // parseFloat normalizes
         expectValidTimeout('005s', '5s') // parseFloat normalizes
      })
   })
})
