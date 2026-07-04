# Deployment

Environments:

- `development`
- `preview`
- `production`

Production deploy is blocked unless:

- tests pass
- typecheck passes
- lint passes
- required local production secrets exist
- migrations are ready
- no real secrets are versioned

Useful commands:

```bash
pnpm secrets:validate -- --production
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm db:d1:migrate:prod
pnpm deploy:production
```
