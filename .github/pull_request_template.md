## Description

<!-- What does this PR do? Why is it needed? Link the relevant issue or ticket. -->

Closes #

## Type of change

- [ ] `type:feat` — new feature
- [ ] `type:fix` — bug fix
- [ ] `type:chore` — non-functional (deps, config, CI)
- [ ] `type:docs` — documentation only
- [ ] `type:refactor` — code restructure, no behaviour change
- [ ] `type:perf` — performance improvement
- [ ] `type:test` — test additions or fixes

## Area

- [ ] `area:booking`
- [ ] `area:tax`
- [ ] `area:search`
- [ ] `area:ai`
- [ ] `area:graph`
- [ ] `area:scraper`
- [ ] `area:quantum`
- [ ] `area:crypto`
- [ ] `area:platform` (main web app / shared infra)

## Test evidence

<!-- Paste test output, coverage diff, or a screenshot of the test run. -->

```
pytest tests/ -v
# paste output here
```

## Screenshots (UI changes only)

<!-- Before / After screenshots if this touches any frontend. Delete if N/A. -->

| Before | After |
|--------|-------|
|        |       |

## Checklist

- [ ] Types / schemas updated in `shared/schema.ts` (or sub-app equivalent)
- [ ] All existing tests pass (`npm run test:unit` / `pytest`)
- [ ] New behaviour is covered by tests
- [ ] Docs updated (README, CHANGELOG unreleased section, docstrings)
- [ ] No secrets, tokens, or credentials committed
- [ ] Branch name follows `feat/{ticket}-{slug}` / `fix/{ticket}-{slug}` convention
