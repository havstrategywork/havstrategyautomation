const dev = process.env.NODE_ENV !== "production";
// ponytail: 'unsafe-inline' scripts/styles because Next injects inline bootstraps; nonce-based CSP needs fully dynamic rendering.
const csp = [
  "default-src 'self'", `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`, "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self'", "frame-ancestors 'none'", "form-action 'self'", "base-uri 'self'", "object-src 'none'",
].join("; ");

export default {
  // Access Hub: PGlite (embedded Postgres, local/demo only) loads WASM relative to its own file, which bundling breaks, so Next requires it natively.
  serverExternalPackages: ["mongodb", "@electric-sql/pglite", "drizzle-orm"],
  outputFileTracingIncludes: { "/**": ["./access-hub/drizzle/**"] },
  // Tailwind is used only by the Access Hub pages (app/(hub)); the dashboard keeps its own plain CSS.
  turbopack: { rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } },
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, // ignored on plain http://localhost
        { key: "Cache-Control", value: "no-store" }, // pages hold creator data: never cached by the browser or a proxy
      ],
    }];
  },
};
