/**
 * The strict Content Security Policy the local production preview sends (P2-11 S-11, technical decision 11): scripts,
 * module Workers, styles, images and requests from the same origin only, and nothing else. No `unsafe-inline`,
 * `unsafe-eval`, `blob:`, `data:` or wildcard source. The development server, whose client needs inline scripts, sends
 * none. It is the input for the real Static Web Apps headers, which P5 configures and measures.
 */
export const PREVIEW_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
