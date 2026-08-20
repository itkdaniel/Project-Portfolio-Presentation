---
name: WebSocket credential handling
description: Security rule for authenticating browser WebSocket connections without leaking reusable credentials.
---

Use a short-lived, single-use WebSocket ticket obtained through an authenticated HTTP request, and send that ticket outside the URL. Reject connections whose ticket is absent, invalid, expired, or already consumed. A connected socket must stop receiving user-targeted events when its underlying authenticated session expires.

**Why:** Browser WebSocket APIs cannot attach an Authorization header. Passing a long-lived bearer token in the URL exposes it to access logs, reverse proxies, and observability tools where it can be replayed against normal authenticated APIs.

**How to apply:** For any new browser WebSocket event carrying user-specific data, issue a narrowly scoped ticket over the existing authenticated API, limit its lifetime and use count, redact it from logs, and bind the connection lifetime to the original session expiry.