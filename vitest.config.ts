import {defineConfig} from 'vitest/config'

export default defineConfig({
   test: {
      globals: true,
      environment: 'node',
      include: ['**/*.test.ts'],
      testTimeout: 9000,
      clearMocks: true
   }
})
