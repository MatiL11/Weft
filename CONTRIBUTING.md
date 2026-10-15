# Contributing to Weft

Thanks for helping! A few ground rules keep the project healthy:

- **License hygiene.** Weft is MIT. Only add dependencies with MIT-compatible licenses
  (`pnpm license:check` enforces this in CI). Never copy code from proprietary products or
  from projects with incompatible licenses (e.g. AGPL).
- **Clean Architecture.** `packages/core` holds the domain and use cases and must not import
  infrastructure, frameworks or Node IO (enforced by ESLint). Adapters live in `packages/infra/*`.
- **Tests first.** Write a failing test, make it pass, refactor. Keep coverage ≥ 80%.
- **Conventional commits.** `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`, `perf:`.

The recorder's browser tests run in headless Chromium. Either install Playwright's build once
(`pnpm --filter @weft/recorder exec playwright install chromium`) or point to a local Chromium
with `CHROMIUM_PATH=/usr/bin/chromium`.

Before opening a PR run:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm license:check && pnpm test
```
