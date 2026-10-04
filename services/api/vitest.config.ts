import { defineConfig } from 'vitest/config'

try {
  process.loadEnvFile('.env')
} catch {
  /* CI provides env directly */
}

export default defineConfig({ test: { globalSetup: ['./test-global-setup.ts'], setupFiles: ['./src/test-setup.ts'], env: {
      AI_PROVIDER: 'mock', APP_ENV: 'development',
      // never the developer's real test keys: payment tests stub the provider and must be deterministic
      RAZORPAY_KEY_ID: 'rzp_test_unitkey00000', RAZORPAY_KEY_SECRET: 'unit-test-key-secret', RAZORPAY_WEBHOOK_SECRET: 'unit-test-webhook-secret-0123456789',
      RAZORPAY_INTERNATIONAL: 'false', BILLING_FORCE_CURRENCY: '',
      // tests create many accounts from one address: the abuse limits are exercised explicitly in src/security; never call real picture providers from tests
      AUTH_SIGNUPS_PER_IP_HOUR: '100000', AUTH_SIGNUPS_PER_IP_DAY: '100000', AUTH_SIGNIN_FAILS_PER_EMAIL: '100000', AUTH_SIGNIN_FAILS_PER_IP: '100000', AUTH_RESET_PER_EMAIL_HOUR: '100000', AUTH_RESET_PER_IP_HOUR: '100000',
      // the test suite itself books (mock) costs at real model prices: keep the spend breaker out of unrelated tests; src/security/spend-breaker.test.ts sets tiny budgets explicitly
      AI_BUDGET_USD_HOUR: '1000000', AI_BUDGET_USD_DAY: '1000000', AI_USER_USD_DAY: '1000000',
      PEXELS_API_KEY: '', UNSPLASH_ACCESS_KEY: '', UNPLASH_ACCESS_KEY: '',
    }, include: ['src/**/*.test.ts'], testTimeout: 15_000, fileParallelism: false } })
