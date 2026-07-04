# Local secrets

Keep real secret values only in local, untracked files such as:

- `.secrets/development.env`
- `.secrets/production.env`

Never commit real credentials. The `*.example` files list required keys with empty values only.

Production Cloudflare secrets must be applied with Wrangler secure secrets, for example:

```bash
npx wrangler secret put META_WHATSAPP_TOKEN
npx wrangler secret put META_VERIFY_TOKEN
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put OPENAI_API_KEY
```
