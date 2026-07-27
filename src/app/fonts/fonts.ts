import localFont from 'next/font/local';

/**
 * Every typeface in the app, declared once.
 *
 * `next/font` must be called at module scope, and calling it twice for the
 * same file emits the asset twice — so the storefront and the admin console
 * import these objects rather than declaring their own.
 *
 * All four are self-hosted from committed woff2 rather than
 * `next/font/google`, which fetches from fonts.gstatic.com at *build* time.
 * That failed intermittently here and would break any build without egress
 * to Google. See `README.md` in this directory for licences and subsetting.
 */

/** Storefront body/display. */
export const geistSans = localFont({
  src: './Geist-Variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-geist-sans',
  display: 'swap',
});

/** Storefront monospace. */
export const geistMono = localFont({
  src: './GeistMono-Variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--font-geist-mono',
  display: 'swap',
});

/** The console/catalog display face. One variable file covers the whole
 * axis, so every weight used costs nothing extra. */
export const archivo = localFont({
  src: './Archivo-Variable.woff2',
  weight: '100 900',
  style: 'normal',
  variable: '--ui-sans',
  display: 'swap',
});

/** Labels, figures and anything tabular. Static weights — IBM Plex Mono has
 * no variable build on Google Fonts. */
export const plexMono = localFont({
  src: [
    { path: './IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: './IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
    { path: './IBMPlexMono-SemiBold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--ui-mono',
  display: 'swap',
});
