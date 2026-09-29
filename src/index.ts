import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface Env {
  PRINTIFY_API_KEY: string;
  URL_SECRET: string;
  MCP_OBJECT: DurableObjectNamespace;
}

const PRINTIFY_BASE = "https://api.printify.com/v1";

async function printifyFetch(
  env: Env,
  path: string,
  query?: Record<string, string | number | undefined>,
) {
  const url = new URL(`${PRINTIFY_BASE}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.PRINTIFY_API_KEY}`,
      "User-Agent": "printify-mcp/0.1 (+https://github.com/)",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Printify ${res.status} ${res.statusText} on ${path}: ${body.slice(0, 500)}`,
    );
  }
  return res.json();
}

async function printifyPost(
  env: Env,
  path: string,
  body: unknown,
  method: "POST" | "PUT" | "DELETE" = "POST",
) {
  const url = new URL(`${PRINTIFY_BASE}${path}`);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.PRINTIFY_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "printify-mcp/0.2 (+https://github.com/)",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Printify ${res.status} ${res.statusText} on ${method} ${path}: ${errBody.slice(0, 800)}`,
    );
  }
  // Some endpoints return 200 with empty body
  const text = await res.text();
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}

function asText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export class PrintifyMCP extends McpAgent<Env> {
  server = new McpServer(
    { name: "printify", version: "0.4.0" },
    {
      instructions: `This connector exposes Printify API tools for Project HALO swag. Confirm blueprint and variant IDs with get_blueprint or get_blueprint_variants before building. Ask the user before publishing or deleting any product, and state the price and variants you intend to set. Light designs belong on dark garments and dark designs on light garments.`,
    },
  );

  async init() {
    const env = this.env;

    this.server.tool(
      "list_shops",
      "List all shops connected to your Printify account. Run this first to get the shop_id used by other tools.",
      {},
      async () => asText(await printifyFetch(env, "/shops.json")),
    );

    this.server.tool(
      "list_products",
      "List products in a shop.",
      {
        shop_id: z
          .union([z.string(), z.number()])
          .describe("Shop ID from list_shops"),
        page: z.number().int().min(1).optional().describe("Page number (default 1)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Items per page (max 100)"),
      },
      async ({ shop_id, page, limit }) =>
        asText(
          await printifyFetch(env, `/shops/${shop_id}/products.json`, { page, limit }),
        ),
    );

    this.server.tool(
      "get_product",
      "Get full details for a single product, including variants and print areas.",
      {
        shop_id: z.union([z.string(), z.number()]),
        product_id: z.string(),
      },
      async ({ shop_id, product_id }) =>
        asText(
          await printifyFetch(env, `/shops/${shop_id}/products/${product_id}.json`),
        ),
    );

    this.server.tool(
      "list_orders",
      "List orders for a shop.",
      {
        shop_id: z.union([z.string(), z.number()]),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        status: z
          .string()
          .optional()
          .describe("Filter by status, e.g. 'pending', 'on-hold', 'fulfilled', 'cancelled'"),
      },
      async ({ shop_id, page, limit, status }) =>
        asText(
          await printifyFetch(env, `/shops/${shop_id}/orders.json`, {
            page,
            limit,
            status,
          }),
        ),
    );

    this.server.tool(
      "get_order",
      "Get full details for a single order including line items, shipping, and status history.",
      {
        shop_id: z.union([z.string(), z.number()]),
        order_id: z.string(),
      },
      async ({ shop_id, order_id }) =>
        asText(await printifyFetch(env, `/shops/${shop_id}/orders/${order_id}.json`)),
    );

    this.server.tool(
      "list_blueprints",
      "List all product blueprints in the Printify catalog (t-shirts, mugs, hoodies, etc.).",
      {},
      async () => asText(await printifyFetch(env, "/catalog/blueprints.json")),
    );

    this.server.tool(
      "get_blueprint",
      "Get details for a specific blueprint.",
      { blueprint_id: z.union([z.string(), z.number()]) },
      async ({ blueprint_id }) =>
        asText(await printifyFetch(env, `/catalog/blueprints/${blueprint_id}.json`)),
    );

    this.server.tool(
      "list_print_providers_for_blueprint",
      "List print providers that can produce a given blueprint.",
      { blueprint_id: z.union([z.string(), z.number()]) },
      async ({ blueprint_id }) =>
        asText(
          await printifyFetch(
            env,
            `/catalog/blueprints/${blueprint_id}/print_providers.json`,
          ),
        ),
    );

    this.server.tool(
      "get_blueprint_variants",
      "Get available variants (sizes, colors) for a blueprint at a given print provider.",
      {
        blueprint_id: z.union([z.string(), z.number()]),
        print_provider_id: z.union([z.string(), z.number()]),
      },
      async ({ blueprint_id, print_provider_id }) =>
        asText(
          await printifyFetch(
            env,
            `/catalog/blueprints/${blueprint_id}/print_providers/${print_provider_id}/variants.json`,
          ),
        ),
    );

    this.server.tool(
      "list_print_providers",
      "List all print providers in the Printify catalog.",
      {},
      async () => asText(await printifyFetch(env, "/catalog/print_providers.json")),
    );

    this.server.tool(
      "list_uploads",
      "List images uploaded to your Printify media library.",
      {
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      async ({ page, limit }) =>
        asText(await printifyFetch(env, "/uploads.json", { page, limit })),
    );

    this.server.tool(
      "get_upload",
      "Get metadata for a single uploaded image.",
      { upload_id: z.string() },
      async ({ upload_id }) =>
        asText(await printifyFetch(env, `/uploads/${upload_id}.json`)),
    );

    // ───────────────────────── WRITE TOOLS ─────────────────────────

    this.server.tool(
      "upload_image",
      "Upload an image to the Printify media library. Provide EITHER url (public URL Printify can fetch) OR contents (base64-encoded image data). Returns upload_id used in create_product.",
      {
        file_name: z
          .string()
          .describe("Filename including extension, e.g. 'bobbers.png'"),
        url: z
          .string()
          .url()
          .optional()
          .describe("Public HTTPS URL Printify can pull the image from"),
        contents: z
          .string()
          .optional()
          .describe("Base64-encoded image bytes (use this when no public URL)"),
      },
      async ({ file_name, url, contents }) => {
        if (!url && !contents) {
          throw new Error("Provide either url or contents (base64)");
        }
        const body: Record<string, string> = { file_name };
        if (url) body.url = url;
        if (contents) body.contents = contents;
        return asText(await printifyPost(env, "/uploads/images.json", body));
      },
    );

    this.server.tool(
      "create_product",
      "Create a new product in a Printify shop. The product is saved as a draft (visible=false in shop) until publish_product is called. Body must include: title, description, blueprint_id, print_provider_id, variants array (each with id, price in cents, is_enabled), print_areas array. See Printify docs: POST /v1/shops/{shop_id}/products.json",
      {
        shop_id: z.union([z.string(), z.number()]),
        title: z.string(),
        description: z.string(),
        blueprint_id: z.union([z.string(), z.number()]),
        print_provider_id: z.union([z.string(), z.number()]),
        variants: z
          .array(
            z.object({
              id: z.number().int(),
              price: z.number().int().describe("Price in cents, e.g. 3999 for $39.99"),
              is_enabled: z.boolean().optional(),
            }),
          )
          .describe("Variants to enable on this product. Get IDs from get_blueprint_variants."),
        print_areas: z
          .array(
            z.object({
              variant_ids: z.array(z.number().int()),
              placeholders: z.array(
                z.object({
                  position: z
                    .enum(["front", "back", "sleeve_left", "sleeve_right", "neck_label"])
                    .describe("Print area position"),
                  images: z.array(
                    z.object({
                      id: z.string().describe("Upload ID from upload_image"),
                      x: z.number().optional().default(0.5),
                      y: z.number().optional().default(0.5),
                      scale: z.number().optional().default(1),
                      angle: z.number().optional().default(0),
                    }),
                  ),
                }),
              ),
            }),
          )
          .describe("Print placement config. Map design upload to print position per variant set."),
        tags: z.array(z.string()).optional(),
      },
      async ({ shop_id, ...productBody }) =>
        asText(
          await printifyPost(env, `/shops/${shop_id}/products.json`, productBody),
        ),
    );

    this.server.tool(
      "publish_product",
      "Publish a Printify product to the connected sales channel (e.g. Shopify). Sets the product visible on the storefront.",
      {
        shop_id: z.union([z.string(), z.number()]),
        product_id: z.string(),
        title: z.boolean().optional().default(true),
        description: z.boolean().optional().default(true),
        images: z.boolean().optional().default(true),
        variants: z.boolean().optional().default(true),
        tags: z.boolean().optional().default(true),
      },
      async ({ shop_id, product_id, ...flags }) =>
        asText(
          await printifyPost(
            env,
            `/shops/${shop_id}/products/${product_id}/publish.json`,
            flags,
          ),
        ),
    );

    this.server.tool(
      "delete_product",
      "Delete a product from a Printify shop. This also unpublishes from the connected sales channel.",
      {
        shop_id: z.union([z.string(), z.number()]),
        product_id: z.string(),
      },
      async ({ shop_id, product_id }) =>
        asText(
          await printifyPost(
            env,
            `/shops/${shop_id}/products/${product_id}.json`,
            undefined,
            "DELETE",
          ),
        ),
    );

    this.server.tool(
      "update_product",
      "Update an existing product. Pass only the fields you want to change (title, description, variants, tags, etc.).",
      {
        shop_id: z.union([z.string(), z.number()]),
        product_id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        variants: z
          .array(
            z.object({
              id: z.number().int(),
              price: z.number().int().optional(),
              is_enabled: z.boolean().optional(),
            }),
          )
          .optional(),
      },
      async ({ shop_id, product_id, ...patch }) =>
        asText(
          await printifyPost(
            env,
            `/shops/${shop_id}/products/${product_id}.json`,
            patch,
            "PUT",
          ),
        ),
    );
  }
}

// --- OAuth stub helpers (anonymous access; satisfies claude.ai custom-connector OAuth flow) ---
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function workerOrigin(request: Request): string {
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    let url = new URL(request.url);

    // Private-path gate: every request must start with /<URL_SECRET>/.
    // Without it the worker answers 404, so a guessed workers.dev URL is useless.
    const prefix = `/${env.URL_SECRET}`;
    if (!env.URL_SECRET || env.URL_SECRET.length < 24 ||
        !(url.pathname === prefix || url.pathname.startsWith(prefix + "/"))) {
      return new Response("Not found", { status: 404 });
    }
    url.pathname = url.pathname.slice(prefix.length) || "/";
    request = new Request(url.toString(), request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // --- OAuth 2.1 stub endpoints (claude.ai custom connector compatibility) ---
    // Anyone with the worker URL can mint a token. No real user auth.
    // The worker's Printify API key (Cloudflare secret) is the actual access control.
    const origin = workerOrigin(request) + prefix;

    if (url.pathname === "/.well-known/oauth-protected-resource"
        || url.pathname === "/.well-known/oauth-protected-resource/mcp") {
      return jsonResp({
        resource: `${origin}/mcp`,
        authorization_servers: [origin],
        bearer_methods_supported: ["header"],
        scopes_supported: ["mcp"],
      });
    }

    if (url.pathname === "/.well-known/oauth-authorization-server"
        || url.pathname === "/.well-known/openid-configuration") {
      return jsonResp({
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256", "plain"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
        scopes_supported: ["mcp"],
      });
    }

    if (url.pathname === "/oauth/register" && request.method === "POST") {
      const body = await request.json().catch(() => ({} as any));
      const clientId = `printify-${crypto.randomUUID().slice(0, 12)}`;
      return jsonResp({
        client_id: clientId,
        redirect_uris: (body as any).redirect_uris || [],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: (body as any).client_name || "MCP Client",
        scope: "mcp",
      }, 201);
    }

    if (url.pathname === "/oauth/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state") || "";
      if (!redirectUri) {
        return new Response("missing redirect_uri", { status: 400, headers: CORS_HEADERS });
      }
      const code = crypto.randomUUID();
      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      if (state) redirect.searchParams.set("state", state);
      return Response.redirect(redirect.toString(), 302);
    }

    if (url.pathname === "/oauth/token" && request.method === "POST") {
      const token = `sk-anon-${crypto.randomUUID()}`;
      return jsonResp({
        access_token: token,
        token_type: "Bearer",
        expires_in: 31536000,
        refresh_token: `rt-${crypto.randomUUID()}`,
        scope: "mcp",
      });
    }

    // --- MCP transport endpoints (gated by Bearer-token presence) ---
    const checkBearer = () => {
      const auth = request.headers.get("authorization") || "";
      return auth.toLowerCase().startsWith("bearer ");
    };
    const challenge401 = () => new Response(
      JSON.stringify({ error: "unauthorized" }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
          ...CORS_HEADERS,
        },
      },
    );

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      if (!checkBearer()) return challenge401();
      return PrintifyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }
    if (url.pathname === "/mcp") {
      if (!checkBearer()) return challenge401();
      return PrintifyMCP.serve("/mcp").fetch(request, env, ctx);
    }
    return new Response(
      "Printify MCP server. Connect Claude via <secret>/mcp.",
      { status: 200, headers: { "content-type": "text/plain" } },
    );
  },
};
