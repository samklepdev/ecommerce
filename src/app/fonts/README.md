# Storefront fonts

Self-hosted so the build needs no network. `next/font/google` fetches from
fonts.gstatic.com at **build** time, which failed intermittently here and
would break any CI or deploy without egress to Google.

| File | Family | Licence |
| --- | --- | --- |
| `Geist-Variable.woff2` | Geist, variable 100–900 | SIL OFL 1.1 — `OFL-Geist.txt` |
| `GeistMono-Variable.woff2` | Geist Mono, variable 100–900 | SIL OFL 1.1 — `OFL-Geist.txt` |

Latin subsets only (~52 KB total), from the `U+0000-00FF` block of the Google
Fonts CSS. Add the other unicode-range subsets if the storefront ever renders
non-latin text.

Wired up in `src/app/layout.tsx` as `--font-geist-sans` / `--font-geist-mono`.
The admin console has its own pair under `src/app/(admin)/fonts/`.
