## What and why

<!-- One or two sentences: what this changes and the problem it solves. -->

## How I checked it

<!-- What you ran and what you saw. "Should work" is not enough. -->

- [ ] `pnpm type-check` and `pnpm lint` pass
- [ ] Relevant tests run (`pnpm exec vitest run <path>`), or none apply
- [ ] Tried it on the Vercel preview or locally, with screenshots for UI changes

## Risk

- [ ] Touches money (IQD amounts), stock, or order status
- [ ] Touches tenant scoping, auth, or RLS
- [ ] Adds or changes a database migration (see CONTRIBUTING.md, "Database changes")
- [ ] Needs a new environment variable (name it here, never the value)
