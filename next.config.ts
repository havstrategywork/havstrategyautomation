const dev = process.env.NODE_ENV !== "production";
// ponytail: 'unsafe-inline' scripts/styles because Next injects inline bootstraps; nonce-based CSP needs fully dynamic rendering.
const csp = [
  "default-src 'self'", `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`, "style-src 'self' 'unsafe-inline'",
  // img-src allows https: so Instagram thumbnails in the social reports load (their CDN hosts vary)
  "img-src 'self' data: blob: https:", "font-src 'self' data:", "connect-src 'self'", "frame-ancestors 'none'", "form-action 'self'", "base-uri 'self'", "object-src 'none'",
].join("; ");

export default {
  serverExternalPackages: ["mongodb"],
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
