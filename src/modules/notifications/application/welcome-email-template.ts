export interface WelcomeEmailTemplateInput {
  email: string;
  trackingUrl: string;
}

/** Pure rendering — no infra imports, so it's unit-testable without a
 * database or network, per this repo's use-case testing rule. The tracking
 * pixel is the whole point: real email clients load `<img>` tags by default
 * (often after a "load images?" prompt), which is what flips the "opened"
 * status server-side. */
export function renderWelcomeEmailHtml({ email, trackingUrl }: WelcomeEmailTemplateInput): string {
  return `
    <html>
      <body style="font-family: sans-serif; color: #111;">
        <h1>Welcome!</h1>
        <p>Thanks for creating an account with ${email}.</p>
        <p>You can manage your profile, avatar, and password from your account page any time.</p>
        <img src="${trackingUrl}" width="1" height="1" alt="" style="display:none" />
      </body>
    </html>
  `.trim();
}
