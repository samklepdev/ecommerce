import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResendEmailSender } from './resend-email-sender';

function stubFetch(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResendEmailSender', () => {
  it('posts the message to Resend with the configured sender and key', async () => {
    const fetchMock = stubFetch(new Response('{"id":"re_1"}', { status: 200 }));

    await new ResendEmailSender('re_test_key', 'orders@shop.example').send({
      to: 'buyer@example.com',
      subject: 'Payment confirmed',
      html: '<p>Thanks</p>',
      text: 'Thanks',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer re_test_key');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'orders@shop.example',
      to: 'buyer@example.com',
      subject: 'Payment confirmed',
      html: '<p>Thanks</p>',
      text: 'Thanks',
    });
  });

  // Resend treats a present-but-blank text part as the alternative, and some
  // clients then render an empty message. Absent has to mean absent.
  it('omits the text part entirely when there is none', async () => {
    const fetchMock = stubFetch(new Response('{"id":"re_1"}', { status: 200 }));

    await new ResendEmailSender('re_test_key', 'orders@shop.example').send({
      to: 'buyer@example.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('text');
  });

  // A rejected send has to be loud. Callers that can tolerate it (signup)
  // already catch; the ones that can't must not report success.
  it('throws when Resend rejects the message', async () => {
    stubFetch(new Response('{"message":"domain not verified"}', { status: 403 }));

    await expect(
      new ResendEmailSender('re_test_key', 'orders@shop.example').send({
        to: 'b@example.com',
        subject: 'Hi',
        html: '<p/>',
      }),
    ).rejects.toThrow(/403/);
  });

  // The body carries password-reset and verification links. An error path
  // that echoed it into logs would be the same leak by another route.
  it('does not put the message body in the error it throws', async () => {
    stubFetch(new Response('{"message":"nope"}', { status: 500 }));

    const send = new ResendEmailSender('re_test_key', 'orders@shop.example').send({
      to: 'b@example.com',
      subject: 'Reset your password',
      html: '<a href="https://shop.example/reset-password/SECRET-TOKEN">Reset</a>',
      text: 'Reset: https://shop.example/reset-password/SECRET-TOKEN',
    });

    await expect(send).rejects.toThrow();
    await send.catch((e: unknown) => {
      expect(String(e)).not.toContain('SECRET-TOKEN');
    });
  });
});
