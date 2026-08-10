import { ConfigService } from '@nestjs/config';
import { SendtextSmsProvider } from './sendtext-sms.provider';

describe('SendtextSmsProvider', () => {
  let provider: SendtextSmsProvider;
  let fetchMock: jest.Mock;

  const configService = {
    get: (key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        SENDTEXT_API_URL: 'https://api.sendtext.sn/v1/sms/ml',
        SENDTEXT_API_KEY: 'test-key',
        SENDTEXT_API_SECRET: 'test-secret',
        SENDTEXT_SENDER_NAME: 'Telima',
      };
      return config[key] ?? defaultValue;
    },
  } as unknown as ConfigService;

  beforeEach(() => {
    provider = new SendtextSmsProvider(configService);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should throw at construction if credentials are missing', () => {
    const emptyConfig = { get: () => '' } as unknown as ConfigService;
    expect(() => new SendtextSmsProvider(emptyConfig)).toThrow(/SENDTEXT_API_KEY/);
  });

  it('should send the OTP with the documented headers, body and phone format', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        statusId: 1,
        status: 'success',
        messageId: '20550516131355413801',
        msgStatus: 'Sent',
      }),
    });

    const result = await provider.sendOtp('+22375673336', '1234');

    expect(result).toEqual({ messageId: '20550516131355413801' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sendtext.sn/v1/sms/ml');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      'snt-api-key': 'test-key',
      'snt-api-secret': 'test-secret',
    });

    const body = JSON.parse(options.body as string) as Record<string, string>;
    // Format exige par sendtext.sn : indicatif sans '+'.
    expect(body.phone).toBe('22375673336');
    expect(body.sender_name).toBe('Telima');
    expect(body.text).toContain('1234');
  });

  it('should throw on HTTP error (apiCode/apiMsg)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ Message: 'Unauthorized' }),
    });

    await expect(provider.sendOtp('+22375673336', '1234')).rejects.toThrow(/HTTP 401/);
  });

  it('should throw on business refusal (statusId != 1)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ apiCode: 557, apiMsg: 'numero invalide' }),
    });

    await expect(provider.sendOtp('+22375673336', '1234')).rejects.toThrow(/envoi refuse/);
  });

  it('should throw on network failure without leaking the OTP code', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(provider.sendOtp('+22375673336', '1234')).rejects.toThrow(/erreur reseau/);
  });
});
