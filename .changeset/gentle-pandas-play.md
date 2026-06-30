---
"cloudflare-assets": minor
---

Add logger, sanitize, ADR docs, renovate and changesets

- Add structured logging with pino (src/lib/logger.ts)
- Add HTML sanitization with DOMPurify (src/lib/sanitize.ts)
- Add ADR documentation (001: toolchain, 002: error handling, 003: testing)
- Add architecture documentation (docs/ARCHITECTURE.md)
- Add renovate config for auto dependency updates (.github/renovate.json)
- Add changesets for changelog management (.changeset/)
- Replace console.log with logger in src/lib/workflow-result.ts and src/lib/cf-api.ts
