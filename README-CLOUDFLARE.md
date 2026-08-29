# KORYAGIN DESIGN - Cloudflare deployment

This archive contains the latest production source prepared for an independent
Cloudflare Workers deployment. It does not depend on ChatGPT Sites.

## Cloudflare Workers Builds

1. Upload the complete contents of this folder to a private GitHub repository.
2. In Cloudflare, open **Workers & Pages** and choose **Connect GitHub**.
3. Select the repository.
4. Use these build settings:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy --config wrangler.jsonc`
   - Root directory: `/`
5. Add the encrypted Worker secret `SUPABASE_SERVICE_ROLE_KEY`.
6. Protect `/admin*` and `/api/portfolio-*` with Cloudflare Access and allow
   only `koryaginstudio@gmail.com`.
7. Connect `koryagindesign.com` under **Settings > Domains & Routes**.

Never commit the Supabase service-role key to GitHub.
