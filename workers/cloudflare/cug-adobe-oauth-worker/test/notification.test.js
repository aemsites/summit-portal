import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendMagicLinkConfirm, sendMagicLinkNotFound } from '../src/notification.js';
import { createMockEnv } from './helpers.js';

const APO_OK = '<result status="OK"><messageId>123</messageId></result>';

function mockImsAndApo({ imsStatus = 200, apoStatus = 200, apoBody = APO_OK } = {}) {
  return vi.fn()
    .mockResolvedValueOnce(new Response(
      JSON.stringify({ access_token: 'test-token' }),
      { status: imsStatus, headers: { 'Content-Type': 'application/json' } },
    ))
    .mockResolvedValueOnce(new Response(apoBody, { status: apoStatus }));
}

describe('notification', () => {
  let env;

  beforeEach(() => {
    env = createMockEnv({
      APO_CLIENT_ID: 'apo-client',
      APO_CLIENT_SECRET: 'apo-secret',
      APO_SCOPE: 'openid,email',
      ENVIRONMENT: 'stage',
    });
    vi.unstubAllGlobals();
  });

  describe('sendMagicLinkConfirm', () => {
    it('fetches an IMS token using client_credentials then calls the APO stage endpoint', async () => {
      const fetchMock = mockImsAndApo();
      vi.stubGlobal('fetch', fetchMock);

      await sendMagicLinkConfirm('alice@adobe.com', 'https://act.aem.now/adobe?token=abc', env);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [imsUrl, imsOpts] = fetchMock.mock.calls[0];
      expect(imsUrl).toContain('ims-na1-stg1.adobelogin.com/ims/token/v3');
      expect(imsOpts.body.toString()).toContain('grant_type=client_credentials');
      expect(fetchMock.mock.calls[1][0]).toContain('stage.postoffice.adobe.com');
    });

    it('sends to the user with admin CC, correct template, and magic_link + email data', async () => {
      const fetchMock = mockImsAndApo();
      vi.stubGlobal('fetch', fetchMock);

      await sendMagicLinkConfirm('alice@adobe.com', 'https://act.aem.now/adobe?token=abc', env);

      const [apoUrl, apoOpts] = fetchMock.mock.calls[1];
      expect(apoUrl).toContain('templateName=expdev_portal_magic_link_confirm');
      expect(apoOpts.headers.Authorization).toBe('IMS test-token');
      expect(apoOpts.body).toContain('<toList>alice@adobe.com</toList>');
      expect(apoOpts.body).toContain('<ccList>aemsitestrial@adobe.com</ccList>');
      expect(apoOpts.body).toContain('<key>magic_link</key>');
      expect(apoOpts.body).toContain('<value>https://act.aem.now/adobe?token=abc</value>');
      expect(apoOpts.body).toContain('<key>email</key>');
      expect(apoOpts.body).toContain('<value>alice@adobe.com</value>');
    });

    it('uses prod IMS and APO hosts when ENVIRONMENT is prod', async () => {
      const fetchMock = mockImsAndApo();
      vi.stubGlobal('fetch', fetchMock);

      await sendMagicLinkConfirm(
        'alice@adobe.com', 'https://act.aem.now/adobe?token=abc',
        createMockEnv({ APO_CLIENT_ID: 'c', APO_CLIENT_SECRET: 's', APO_SCOPE: 'o', ENVIRONMENT: 'prod' }),
      );

      expect(fetchMock.mock.calls[0][0]).toContain('ims-na1.adobelogin.com');
      expect(fetchMock.mock.calls[0][0]).not.toContain('stg1');
      expect(fetchMock.mock.calls[1][0]).toContain('postoffice.adobe.com');
      expect(fetchMock.mock.calls[1][0]).not.toContain('stage.');
    });

    it('uses authorization_code grant when APO_AUTHORIZATION_CODE is set', async () => {
      const fetchMock = mockImsAndApo();
      vi.stubGlobal('fetch', fetchMock);

      await sendMagicLinkConfirm(
        'alice@adobe.com', 'https://act.aem.now/adobe?token=abc',
        createMockEnv({
          APO_CLIENT_ID: 'c', APO_CLIENT_SECRET: 's', APO_SCOPE: 'o',
          ENVIRONMENT: 'stage', APO_AUTHORIZATION_CODE: 'code123',
        }),
      );

      const imsBody = fetchMock.mock.calls[0][1].body.toString();
      expect(imsBody).toContain('grant_type=authorization_code');
      expect(imsBody).toContain('code=code123');
    });

    it('throws when IMS returns a non-2xx status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 401 })));

      await expect(sendMagicLinkConfirm('alice@adobe.com', 'https://act.aem.now/adobe?token=abc', env))
        .rejects.toThrow('IMS auth failed: 401');
    });

    it('throws when APO returns a non-2xx status', async () => {
      vi.stubGlobal('fetch', mockImsAndApo({ apoStatus: 500 }));

      await expect(sendMagicLinkConfirm('alice@adobe.com', 'https://act.aem.now/adobe?token=abc', env))
        .rejects.toThrow('APO request failed: 500');
    });

    it('throws when APO response body does not contain status="OK"', async () => {
      vi.stubGlobal('fetch', mockImsAndApo({ apoBody: '<result status="ERROR"><message>fail</message></result>' }));

      await expect(sendMagicLinkConfirm('alice@adobe.com', 'https://act.aem.now/adobe?token=abc', env))
        .rejects.toThrow('APO returned non-OK');
    });
  });

  describe('sendMagicLinkNotFound', () => {
    it('sends the notify template to admin with email data and no ccList', async () => {
      const fetchMock = mockImsAndApo();
      vi.stubGlobal('fetch', fetchMock);

      await sendMagicLinkNotFound('unknown@mystery.com', env);

      const [apoUrl, apoOpts] = fetchMock.mock.calls[1];
      expect(apoUrl).toContain('templateName=expdev_portal_magic_link_notify');
      expect(apoOpts.body).toContain('<toList>aemsitestrial@adobe.com</toList>');
      expect(apoOpts.body).not.toContain('<ccList>');
      expect(apoOpts.body).toContain('<key>email</key>');
      expect(apoOpts.body).toContain('<value>unknown@mystery.com</value>');
    });
  });
});
