const dev = process.env.NODE_ENV !== "production";
// ponytail: 'unsafe-inline' scripts/styles because Next injects inline bootstraps; nonce-based CSP needs fully dynamic rendering.
const csp = [
  "default-src 'self'", `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`, "style-src 'self' 'unsafe-inline'",
  // img-src allows https: so Instagram thumbnails in the social reports load (their CDN hosts vary)
  "img-src 'self' data: blob: https:", "font-src 'self' data:", // connect-src: the public onboarding form uploads files straight from the browser to UploadThing
  "connect-src 'self' https://*.ingest.uploadthing.com https://*.ufs.sh https://uploadthing.com https://*.uploadthing.com", "frame-ancestors 'none'", "form-action 'self'", "base-uri 'self'", "object-src 'none'",
].join("; ");

export default {
  // Dev only: `next dev` answers its own scripts with 403 unless the page was opened from "localhost", so the public onboarding form looked fine but did nothing
  // from 127.0.0.1, a phone on the same wifi, or an ngrok link. These origins may use the dev server.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*", "*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io"],
  serverExternalPackages: ["mongodb"],
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
