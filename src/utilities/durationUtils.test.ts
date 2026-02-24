import {vi, type Mocked} from 'vitest'
import {parseDuration} from './durationUtils.js'
import * as core from '@actions/core'

// Mock core.debug
vi.mock('@actions/core')
const mockCore = core as Mocked<typeof core>

// Test data constants
const VALID_TIMEOUTS = {
   withUnits: ['5s', '10m', '1h', '500ms'],
   decimals: ['0.5s', '1.25m', '2.5h'],
   caseInsensitive: ['5S', '10M', '1H'],
   expectedLowercase: ['5s', '10m', '1h'],
   bareNumbers: ['5', '15', '120'],
   expectedWithMinutes: ['5m', '15m', '120m'],
   whitespace: ['  10s', '1m  ', '\t2h\n'],
   expectedTrimmed: ['10s', '1m', '2h'],
   rangeValid: ['1ms', '999ms', '0.5s', '1439m', '23.999h'],
   edgeCases: ['0.001s', '0.0167m', '24h']
}

const INVALID_TIMEOUTS = {
   badFormats: ['', 'abc', '30x', '30 s', '30sm'],
   negative: ['-5m', '-1s', '-0.5h'],
   zero: ['0s', '0m', '0h', '0ms'],
   belowMin: ['0.0001s', '0.00001ms'],
   aboveMax: ['25h', '1441m', '86401s']
}

const ERROR_MESSAGES = {
   invalidFormat: (input: string) =>
      `Invalid duration format: "${input}". Use: number + unit (30s, 5m, 1h) or just number (assumes minutes)`,
   notPositive: (input: string) => `Duration must be positive: "${input}"`,
   outOfRange: (input: string) =>
      `Duration out of range (1ms to 24h): "${input}"`
}

// Helper functions
const expectValidTimeout = (input: string, expected: string) => {
   expect(parseDuration(input)).toBe(expected)
}

const expectInvalidTimeout = (input: string, expectedError: string) => {
   expect(() => parseDuration(input)).toThrow(expectedError)
}

describe('validateTimeoutDuration', () => {
   beforeEach(() => {
      vi.clearAllMocks()
   })

   describe('valid timeout formats', () => {
      const validCases: Array<[string, string, string]> = [
         ...VALID_TIMEOUTS.withUnits.map((v): [string, string, string] => [
            v,
            v,
            'accepts number with valid units'
         ]),
         ...VALID_TIMEOUTS.decimals.map((v): [string, string, string] => [
            v,
            v,
            'accepts decimal number with units'
         ]),
         ...VALID_TIMEOUTS.caseInsensitive.map(
            (v, i): [string, string, string] => [
               v,
               VALID_TIMEOUTS.expectedLowercase[i],
               'handles case-insensitive units'
            ]
         ),
         ...VALID_TIMEOUTS.bareNumbers.map((v, i): [string, string, string] => [
            v,
            VALID_TIMEOUTS.expectedWithMinutes[i],
            'assumes minutes for bare numbers'
         ]),
         ...VALID_TIMEOUTS.whitespace.map((v, i): [string, string, string] => [
            v,
            VALID_TIMEOUTS.expectedTrimmed[i],
            'trims whitespace'
         ])
      ]

      test.each(validCases)('%s → %s (%s)', (input, expected, description) => {
         expectValidTimeout(input, expected)
      })

      test('logs assumption for bare numbers only', () => {
         parseDuration('5')
         expect(mockCore.debug).toHaveBeenCalledWith(
            'No unit specified for timeout "5", assuming minutes'
         )

         vi.clearAllMocks()

         parseDuration('30s')
         expect(mockCore.debug).not.toHaveBeenCalled()
      })
   })

   describe('invalid timeout formats', () => {
      const invalidCases: Array<[string, string]> = [
         ...INVALID_TIMEOUTS.badFormats.map((t): [string, string] => [
            t,
            ERROR_MESSAGES.invalidFormat(t)
         ]),
         ...INVALID_TIMEOUTS.negative.map((t): [string, string] => [
            t,
            ERROR_MESSAGES.invalidFormat(t)
         ]),
         ...INVALID_TIMEOUTS.zero.map((t): [string, string] => [
            t,
            ERROR_MESSAGES.notPositive(t)
         ])
      ]

      test.each(invalidCases)('rejects %s', (input, expectedError) => {
         expectInvalidTimeout(input, expectedError)
      })
   })

   describe('range validation', () => {
      const rangeCases: Array<[string, string, boolean]> = [
         ...VALID_TIMEOUTS.rangeValid.map((v): [string, string, boolean] => [
            v,
            v,
            true
         ]),
         ...INVALID_TIMEOUTS.belowMin.map((v): [string, string, boolean] => [
            v,
            ERROR_MESSAGES.outOfRange(v),
            false
         ]),
         ...INVALID_TIMEOUTS.aboveMax.map((v): [string, string, boolean] => [
            v,
            ERROR_MESSAGES.outOfRange(v),
            false
         ]),
         ...VALID_TIMEOUTS.edgeCases.map((v): [string, string, boolean] => [
            v,
            v,
            true
         ])
      ]

      test.each(rangeCases)('%s is %s', (input, expected, isValid) => {
         if (isValid) {
            expectValidTimeout(input, expected)
         } else {
            expectInvalidTimeout(input, expected)
         }
      })
   })

   describe('edge cases', () => {
      test.each([
         ['0.001s', '0.001s'],
         ['0.0167m', '0.0167m'],
         ['23.999h', '23.999h'],
         ['1439m', '1439m'],
         ['5.0m', '5m'],
         ['005s', '5s']
      ])('parses and normalizes: %s → %s', (input, expected) => {
         expectValidTimeout(input, expected)
      })
   })
})
