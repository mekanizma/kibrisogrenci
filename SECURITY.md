# Security — kibrisogrenci.com

## Trust boundaries
- **Browser** holds only the publishable (anon) key. All reads it can make are fully protected by RLS.
- **API (server)** forwards the caller's JWT to Supabase so RLS applies (default path).
- **Service-role secret key** is used ONLY in server code for admin endpoints and scheduled jobs. It never appears in any `NEXT_PUBLIC_*` var, client bundle, log line, or error response. CI runs `scripts/check-bundle-secrets.sh`.

## Role source of truth (1.4)
- Role lives in both `profiles.role` and the JWT `app_metadata.role`. We NEVER read role from `user_metadata`.
- One code path changes a role (service-role admin endpoint): updates both, writes `audit_log`, revokes sessions.
- DB trigger `guard_profile_privileged` rejects direct `profiles.role/status` changes unless service role.

## Authorization
- RLS on every table (primary boundary) + server-side ownership/role checks (second layer).
- Return 404 (not 403) for objects the user does not own, to avoid leaking existence.

## Contact gating (2.2)
- Phone numbers never appear in SSR HTML, JSON-LD, list/detail API responses, or sitemaps.
- Served only from a dedicated authenticated endpoint (`/api/reveal`) with per-user/IP daily limits.

## Inputs, sessions, headers
- Pydantic/zod validation; parameterised queries only.
- Rate limiting on login, registration, reset, OTP, reveal, report, search, inbound WhatsApp.
- httpOnly+Secure+SameSite=Lax cookies; rotate refresh tokens; invalidate sessions on password/role change; CSRF on cookie-auth mutations.
- Strict CSP (no unsafe-inline), HSTS preload, X-Content-Type-Options, Referrer-Policy, restrictive Permissions-Policy. CORS allowlist, no wildcard.

## Uploads
- Validate by magic bytes; re-encode server-side; strip EXIF/GPS; max 10MB, 20 photos/listing; private buckets; short-lived signed URLs.

## Logging
- Never log passwords, tokens, OTP, full phone numbers, or raw IPs. IPs hashed with `IP_HASH_SECRET`.

## Vulnerability reporting
- Email security@kibrisogrenci.com. We aim to acknowledge within 72 hours.
