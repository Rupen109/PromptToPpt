# End-to-end QA

Needs: Postgres, API (:4000), web (:3000), editor (:3001) running (`pnpm dev`), and a Chromium that Playwright can drive
(`E2E_CHROMIUM=/path/to/chrome-headless-shell`, defaults to the macOS Playwright cache).

    pnpm e2e              # all suites
    pnpm e2e public auth  # selected suites

Plan: `docs/QA_PLAN.md`. Failures leave screenshots in `e2e/results/`.
