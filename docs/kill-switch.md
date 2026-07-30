# The kill switch

Closes the storefront on demand: no new orders, nothing but the logo on every
customer-facing route — a single mark on an empty page — customer sign-in
paused while admin sign-in keeps working, and orders already paid still settling
and shipping.

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
npm run store:switch-setup            # generate and print the values
npm run store:switch-setup -- --write # ...and write them straight into .env
npm run store:switch-setup -- --show  # QR for whatever is already configured
```

**Use `--write` locally.** The printout carries a 32-character secret *and* a 6-digit
verification code, and pasting the code into `STORE_SWITCH_TOTP_SECRET` is an easy
mistake that stops the app booting. `--write` refuses to overwrite values that are
already set, so it can't silently break a switch your phone is paired with.

**Env is read at boot** — restart the server after changing either value, or the
route stays disabled and every request 404s.

Prints two values to put in your production environment, plus a QR code to scan with
your authenticator app and the current 6-digit code so you can confirm it took:

```
STORE_SWITCH_PATH=<32 random chars>          # the URL segment IS a secret
STORE_SWITCH_TOTP_SECRET=<32 base32 chars>   # the 6-digit code's seed
```

Unset either one and the route does not exist — it 404s exactly like a wrong path. That
is the first thing to check if the URL "doesn't work": an unconfigured route and a
wrong secret are deliberately indistinguishable from outside.

Everything stays in the terminal; no file is written, so there's no secret left on
disk to remember to delete. If your terminal mangles the QR, the `otpauth://` URI is
printed too and every authenticator app accepts manual entry.

**Rotating:** re-run the setup script and replace both env values. The old URL and
the old authenticator entry stop working as soon as the app restarts. Rotate if the
URL has been through logs you don't control, or if a device holding it is lost.

### Why a rotating code and not a static token

A URL you hit from a phone ends up in access logs, proxy logs, and browser history —
that's unavoidable. A static token sitting in those places is a working kill switch
forever. A TOTP code is worthless 30 seconds later.

A used code is burned **per action**, not outright. Browsers re-request: a refresh, a
back-navigation or an omnibox prefetch would otherwise spend the code and make the real
attempt 404 — indistinguishable from a broken kill switch, at the moment you most need
to trust it. So repeating the same code with the same action reports the current state
and changes nothing, while the same code aimed at a *different* action is refused. A
code lifted from a log still can't be turned into the opposite instruction.

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

## Who can still sign in

While closed, **only admins can log in.** Credentials are still checked, but a session is
only kept for an admin.

A refused customer sees exactly what a wrong password produces — "Invalid email or
password." — and nothing else. The login page itself is byte-for-byte what it always is: no
banner, no missing links, nothing that announces the state of the business to whoever loads
it. That also means a closure can't be used to test which addresses have accounts, since the
response is identical for a right password and a wrong one.

| Route | While closed |
|---|---|
| `/login` | Open and visually unchanged. It's the only entrance to the console |
| `/signup`, `/forgot-password` | Paused notice. No new accounts, no reset mail going out unattended |
| `/reset-password`, `/verify-email` | Open — they complete a flow someone was already emailed a link for, and those tokens expire |

**Closing signs every customer out.** Sessions issued before the door shut are the one way in
that the sign-in check doesn't cover, so they're destroyed — Redis is walked with `SCAN`,
never `KEYS`, because `KEYS` blocks the server every request here depends on. Admin sessions
survive, or closing the store would log out the person closing it. The count lands in the
audit entry. If signing out fails, the store still closes: that half is tidying, not the
point.

Customers must sign in again after you reopen. That's the trade for a closure that actually
puts people out rather than leaving live sessions sitting behind a paused page.

Customer writes are refused too, not just hidden: cart changes, wishlist toggles, reviews,
and sourcing inquiries all return the paused message rather than quietly succeeding for
anyone who POSTs to the action directly.

**A tab already open updates itself.** Server-rendered pages only change when the browser
asks again, so closing the shop used to leave anyone mid-visit looking at a live storefront
until they reloaded. A small client watcher checks `/api/store-status` when the tab regains
focus, and every 30s while it's visible — skipped entirely while hidden, so background tabs
cost nothing. It only re-renders when the answer differs from what the server sent. Both
directions work: closing swaps to the notice, reopening swaps back.

## What closing does *not* do

- **It does not stop the BTC watcher.** Coins already sent still confirm, paid orders
  still ship. Closing the front door must not strand someone who paid before you shut
  it — Bitcoin payments are irreversible.
- **It does not stop the process.** The app keeps serving; it refuses to sell. Actually
  stopping the server is a hosting action (`docker stop`, `systemctl stop`), and an app
  that exits can't restart itself.
- **It does not reduce load.** Page components in the storefront group still execute;
  the visitor just sees the paused notice instead of the result.
- **The closed page says nothing.** No header, no footer, no links, no copy, no wordmark —
  one mark, centred, pulsing slowly. Links would all lead back to another copy of the same
  page, and any wording is either a promise the switch can't keep or an explanation nobody
  asked for. The pulse is suppressed under `prefers-reduced-motion`.
- **It does not cancel anything.** Existing orders, carts, and accounts are untouched, and
  reopening puts all of that back as it was. The one thing it does destroy is customer
  sessions — those people have to sign in again.
