import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'game',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
          globalSetup: ['tests/setup/supabaseEnv.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'stadspakket',
          include: ['src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
  },
})
