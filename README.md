# Printify MCP for Claude (Project HALO fork)

Fork of [willjack92/printify-mcp](https://github.com/willjack92/printify-mcp) with three security fixes:

1. **Private address.** The worker only answers at `/<URL_SECRET>/...`. Every other path returns 404, so a guessed `workers.dev` address is useless.
2. **No unauthenticated pass-through.** The `/rest/*` and `/raw/*` routes, which forwarded any request to Printify with no login check, are removed.
3. **Neutral instructions.** The original author's shop-specific pricing and copy rules are replaced with short HALO guidance.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/evanbsmith/printify-mcp)

You will be asked for two secrets:

- `PRINTIFY_API_KEY`: a Printify Personal Access Token (Printify > Settings > Connections). Grant shops, catalog, print providers, products and uploads. **Leave orders.write off** so the key cannot place orders.
- `URL_SECRET`: a random string of 32+ characters (use a password generator). Anything shorter than 24 characters is rejected.

## Connect to Claude

Settings > Connectors > Add custom connector:

- Name: Printify
- URL: `https://printify-mcp.<your-subdomain>.workers.dev/<URL_SECRET>/mcp`

Test with: "List my Printify shops."

Treat the full connector URL like a password. If it leaks, change `URL_SECRET` in the Cloudflare dashboard (Workers > printify-mcp > Settings > Variables and Secrets).

## Notes

- Economy shipping has to be enabled by hand in the Printify dashboard per product.
- Match light designs to dark garments and dark designs to light garments.
