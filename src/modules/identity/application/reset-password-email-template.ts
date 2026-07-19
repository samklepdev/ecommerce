export interface ResetPasswordEmailTemplateInput {
  resetUrl: string;
  expiresInMinutes: number;
}

/** Pure rendering — no infra imports, unit-testable without a database or
 * network. */
export function renderResetPasswordEmailHtml({
  resetUrl,
  expiresInMinutes,
}: ResetPasswordEmailTemplateInput): string {
  return `
    <html>
      <body style="font-family: sans-serif; color: #111;">
        <h1>Reset your password</h1>
        <p>Click the link below to choose a new password. This link expires in
        ${expiresInMinutes} minutes and can only be used once.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </body>
    </html>
  `.trim();
}
