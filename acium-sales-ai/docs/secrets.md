# Secrets

Real secret values must never be committed or sent to the frontend.

Local files:

- `.secrets/development.env`
- `.secrets/production.env`

Tracked examples:

- `.secrets/development.env.example`
- `.secrets/production.env.example`

Apply Cloudflare secrets with secure Wrangler commands:

```bash
npx wrangler secret put META_WHATSAPP_TOKEN
npx wrangler secret put META_VERIFY_TOKEN
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put OPENAI_API_KEY
```

The helper script validates required keys and prints only key names, never values.
