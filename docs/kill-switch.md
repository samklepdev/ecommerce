# The kill switch

Closes the storefront on demand: no new orders, a paused notice on every
customer-facing route, admin and sign-in untouched, and orders already paid still
settling and shipping.

State is one Redis key (`store:closed`). Absent means open.

## Three doors

| Door | Use it when | Auth |
|---|---|---|
| `/admin/settings` → Store status | Normal | Your admin session |
| `npm run store:close` / `store:open` / `store:status` | No browser, or the app is broken | Shell access to the server |
| `GET /api/ops/<STORE_SWITCH_PATH>?action=close&code=<6 digits>` | Phone, no login | Secret path + rotating code |

All three write the same key and record the same audit entries (`store.closed` /
`store.opened`), attributed to `cli`, `ops-url`, or the admin's email.

## Setting up the ops URL

```bash
npm run store:switch-setup
```

Prints two values to put in your production environment, and writes a QR code to a
temp file for your authenticator app:

```
STORE_SWITCH_PATH=<32 random chars>          # the URL segment IS a secret
STORE_SWITCH_TOTP_SECRET=<32 base32 chars>   # the 6-digit code's seed
```

Unset either one and the route does not exist — it 404s exactly like a wrong path.
Delete the QR file once you've scanned it.

**Rotating:** re-run the setup script and replace both env values. The old URL and
the old authenticator entry stop working as soon as the app restarts. Rotate if the
URL has been through logs you don't control, or if a device holding it is lost.

### Why a rotating code and not a static token

A URL you hit from a phone ends up in access logs, proxy logs, and browser history —
that's unavoidable. A static token sitting in those places is a working kill switch
forever. A TOTP code is worthless 30 seconds later, and a used one is burned
immediately so it can't even be replayed inside its own window.

### What it protects against, and what it doesn't

Every rejection returns an identical 404 — wrong path, wrong code, no code, exhausted
budget. Nothing distinguishes "you found the endpoint" from "there is no endpoint".

Guessing is capped at 20 attempts per 10 minutes, counted globally rather than per IP,
because `getClientIp()` reads `x-forwarded-for` and anyone can set that header unless a
trusted proxy overwrites it. Wrong-path probes deliberately don't consume that budget,
so scanners can't use them to close the door on you. If an attacker who somehow knows
your path does exhaust it, this door pauses — but the admin toggle and the CLI are
unaffected, so you can still close or open the store.

**It is unguessable, not unreachable.** Anyone holding both secrets can call it from
anywhere in the world. If you want the endpoint to not exist for everyone else, you
need a network boundary — see below.

## Making it unreachable (recommended for production)

MAC address filtering can't do this: MAC addresses are link-layer and are rewritten at
every router hop, so your server never sees your device's. These do work.

### Tailscale (easiest, and the closest thing to "only my devices")

1. Install Tailscale on the server and on your Mac and phone; join them to the same
   tailnet.
2. Bind the app to the tailnet interface, or keep it public and put **only** the admin
   and ops routes behind it — e.g. in nginx/Caddy, allow `/admin` and `/api/ops` from
   `100.64.0.0/10` (the Tailscale CGNAT range) and deny elsewhere.
3. Optionally lock it down further with a tailnet ACL so only your two devices can
   reach the server at all.

Access is then bound to a WireGuard key pair held by the device, which is what people
usually mean when they ask for MAC whitelisting. Someone with both secrets and no
device on your tailnet cannot even open a connection.

### Plain WireGuard

Same idea without the coordination service: peer your devices to the server, then
restrict the routes to the WireGuard subnet in your reverse proxy. More setup, no
third party involved.

### Cloudflare Access / Tunnel

If you're already behind Cloudflare, put `/admin` and `/api/ops` behind Access with a
device-posture or email policy. Cloudflare terminates the request before it reaches
your origin. Works well from a phone; you're trusting Cloudflare with the boundary.

### IP allowlist (weakest)

Restricting by source IP in the proxy works if you have a static address, but it's
poor for a phone — cellular IPs change constantly — and if you implement it in the
app rather than the proxy it inherits the `x-forwarded-for` spoofing problem above.

## What closing does *not* do

- **It does not stop the BTC watcher.** Coins already sent still confirm, paid orders
  still ship. Closing the front door must not strand someone who paid before you shut
  it — Bitcoin payments are irreversible.
- **It does not stop the process.** The app keeps serving; it refuses to sell. Actually
  stopping the server is a hosting action (`docker stop`, `systemctl stop`), and an app
  that exits can't restart itself.
- **It does not reduce load.** Page components in the storefront group still execute;
  the visitor just sees the paused notice instead of the result.
- **It does not cancel anything.** Existing orders, carts, and accounts are untouched.
  Reopening puts everything back exactly as it was.
