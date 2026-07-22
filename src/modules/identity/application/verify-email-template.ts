export interface VerifyEmailTemplateInput {
  verifyUrl: string;
  expiresInMinutes: number;
}

/** Pure rendering — no infra imports, unit-testable without a database or
 * network. Mirrors `renderResetPasswordEmailHtml`. */
export function renderVerifyEmailHtml({ verifyUrl, expiresInMinutes }: VerifyEmailTemplateInput): string {
  return `
    <html>
      <body style="font-family: sans-serif; color: #111;">
        <h1>Verify your email</h1>
        <p>Click the link below to verify your email address. This link expires in
        ${expiresInMinutes} minutes and can only be used once.</p>
        <p><a href="${verifyUrl}">${verifyUrl}</a></p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      </body>
    </html>
  `.trim();
}
