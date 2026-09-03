const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
  createGrowthAIProviderFromEnvironment,
  createGrowthAIProviderFromFirebaseParameters,
  createOpenAICompatibleGrowthAIProvider,
  validateProviderOutput,
} = require('../growthAIProvider');

describe('GrowthAI provider adapter', () => {
  test('is unavailable without server-only provider configuration', async () => {
    const provider = createGrowthAIProviderFromEnvironment({});
    assert.equal(provider.configured, false);
    await assert.rejects(provider.generateText({}), error => error.code === 'provider_unavailable');
  });

  test('requires the exact external-provider environment enablement value', async () => {
    const configuredEnvironment = {
      GROWTHAI_PROVIDER_API_KEY: 'server-secret',
      GROWTHAI_PROVIDER_BASE_URL: 'https://provider.example/v1',
      GROWTHAI_PROVIDER_MODEL: 'controlled-model',
    };
    for (const enabledValue of [undefined, '', 'false', 'TRUE', '1']) {
      const provider = createGrowthAIProviderFromEnvironment({
        ...configuredEnvironment,
        GROWTHAI_PROVIDER_ENABLED: enabledValue,
      });
      assert.equal(provider.configured, false);
      await assert.rejects(provider.generateText({}), error => error.code === 'provider_unavailable');
    }
    assert.equal(createGrowthAIProviderFromEnvironment({
      ...configuredEnvironment,
      GROWTHAI_PROVIDER_ENABLED: 'true',
    }).configured, true);
  });

  test('uses a local mock only for the exact demo project', async () => {
    const mock = createGrowthAIProviderFromEnvironment({
      FUNCTIONS_EMULATOR: 'true',
      GCLOUD_PROJECT: 'demo-servicesos-v1-smoke-local',
      GROWTHAI_PROVIDER_MODE: 'mock',
    });
    assert.equal(mock.configured, true);
    assert.deepEqual(
      JSON.parse((await mock.generateText({ actionType: 'marketing_post', userPrompt: '' })).text),
      {
        fullCaption: 'Local mock marketing draft for human review. Nothing was published.',
        shortCaption: 'Local mock marketing draft.',
        callToAction: 'Request a quote.',
        hashtags: '#LocalCleaning',
      },
    );
    assert.deepEqual(
      JSON.parse((await mock.generateText({ actionType: 'estimate_assistance', userPrompt: '' })).text),
      {
        recommendedPrice: 205,
        reasoning: 'Local deterministic mock recommendation for human review.',
        assumptions: [],
        scopeSuggestions: [],
        possibleAddOns: [],
        complexityFlags: [],
      },
    );

    const production = createGrowthAIProviderFromEnvironment({
      FUNCTIONS_EMULATOR: 'true',
      GCLOUD_PROJECT: 'cleaning-intake-system',
      GROWTHAI_PROVIDER_MODE: 'mock',
    });
    assert.equal(production.configured, false);

    const nonEmulatedDemo = createGrowthAIProviderFromEnvironment({
      GCLOUD_PROJECT: 'demo-servicesos-v1-smoke-local',
      GROWTHAI_PROVIDER_MODE: 'mock',
    });
    assert.equal(nonEmulatedDemo.configured, false);
  });

  test('resolves Firebase provider parameters lazily at invocation time', () => {
    const reads = [];
    const param = (name, value) => ({
      value() {
        reads.push(name);
        return value;
      },
    });
    const provider = createGrowthAIProviderFromFirebaseParameters({
      apiKeyParam: param('apiKey', 'server-secret'),
      baseUrlParam: param('baseUrl', 'https://provider.example/v1'),
      enabledParam: param('enabled', true),
      modelParam: param('model', 'controlled-model'),
    });

    assert.deepEqual(reads, []);
    assert.equal(provider.configured, true);
    assert.deepEqual(reads, ['enabled', 'apiKey', 'baseUrl', 'model']);
  });

  test('keeps disabled, malformed, and missing Firebase enablement safely unavailable with zero fetch calls', async () => {
    let fetchCalls = 0;
    const configuredParam = { value: () => 'configured' };
    for (const enabledParam of [undefined, { value: () => false }, { value: () => 'true' }, { value: () => 1 }]) {
      const provider = createGrowthAIProviderFromFirebaseParameters({
        apiKeyParam: configuredParam,
        baseUrlParam: configuredParam,
        enabledParam,
        fetchImpl: async () => { fetchCalls += 1; },
        modelParam: configuredParam,
      });
      assert.equal(provider.configured, false);
      await assert.rejects(provider.generateText({}), error => error.code === 'provider_unavailable');
    }
    assert.equal(fetchCalls, 0);
  });

  test('keeps incomplete enabled Firebase provider configuration safely unavailable', async () => {
    const emptyParam = { value: () => '' };
    const populatedParam = { value: () => 'configured' };
    const configurations = [
      { apiKeyParam: emptyParam, baseUrlParam: populatedParam, modelParam: populatedParam },
      { apiKeyParam: populatedParam, baseUrlParam: emptyParam, modelParam: populatedParam },
      { apiKeyParam: populatedParam, baseUrlParam: populatedParam, modelParam: emptyParam },
    ];
    for (const configuration of configurations) {
      const provider = createGrowthAIProviderFromFirebaseParameters({
        ...configuration,
        enabledParam: { value: () => true },
      });
      assert.equal(provider.configured, false);
      await assert.rejects(provider.generateText({}), error => error.code === 'provider_unavailable');
    }
  });

  test('preserves the exact local emulator mock without reading provider parameters', async () => {
    const unavailableParam = {
      value() {
        throw new Error('Local mock must not read production provider configuration.');
      },
    };
    const provider = createGrowthAIProviderFromFirebaseParameters({
      apiKeyParam: unavailableParam,
      baseUrlParam: unavailableParam,
      enabledParam: unavailableParam,
      env: {
        FUNCTIONS_EMULATOR: 'true',
        GCLOUD_PROJECT: 'demo-servicesos-v1-smoke-local',
        GROWTHAI_PROVIDER_MODE: 'mock',
      },
      modelParam: unavailableParam,
    });

    assert.equal(provider.configured, true);
    assert.match((await provider.generateText({ actionType: 'customer_response', userPrompt: '' })).text, /Local mock/);
  });

  test('explicitly enabled Firebase configuration preserves the Responses API request', async () => {
    const calls = [];
    const provider = createGrowthAIProviderFromFirebaseParameters({
      apiKeyParam: { value: () => 'server-secret' },
      baseUrlParam: { value: () => 'https://provider.example/v1' },
      enabledParam: { value: () => true },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          headers: { get: () => 'request-1' },
          json: async () => ({
            id: 'response-1',
            model: 'controlled-model',
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'Generated text' }] }],
          }),
        };
      },
      modelParam: { value: () => 'controlled-model' },
    });
    const result = await provider.generateText({ systemInstruction: 'System', userPrompt: 'User' });
    assert.equal(result.text, 'Generated text');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://provider.example/v1/responses');
    assert.equal(JSON.parse(calls[0].options.body).model, 'controlled-model');
  });

  test('sends fixed server-controlled model settings and validates successful output', async () => {
    const calls = [];
    const provider = createOpenAICompatibleGrowthAIProvider({
      apiKey: 'server-secret',
      baseUrl: 'https://provider.example/v1',
      model: 'controlled-model',
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          headers: { get: () => 'request-1' },
          json: async () => ({
            id: 'response-1',
            model: 'controlled-model',
            output: [{
              type: 'message',
              content: [{ type: 'output_text', text: 'Generated text' }],
            }],
          }),
        };
      },
    });
    const output = await provider.generateText({ systemInstruction: 'System', userPrompt: 'User' });
    assert.equal(output.text, 'Generated text');
    assert.equal(output.providerRequestId, 'request-1');
    assert.equal(calls[0].url, 'https://provider.example/v1/responses');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.model, 'controlled-model');
    assert.equal(body.instructions, 'System');
    assert.equal(body.input, 'User');
    assert.equal(body.store, false);
    assert.equal('temperature' in body, false);
    assert.equal('messages' in body, false);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer server-secret');
  });

  test('handles provider failure and timeout without exposing response details', async () => {
    const failed = createOpenAICompatibleGrowthAIProvider({
      apiKey: 'server-secret', baseUrl: 'https://provider.example/v1', model: 'model',
      fetchImpl: async () => ({ ok: false }),
    });
    await assert.rejects(
      failed.generateText({ systemInstruction: 'System', userPrompt: 'User' }),
      error => error.code === 'provider_error' && !error.message.includes('server-secret'),
    );

    const timedOut = createOpenAICompatibleGrowthAIProvider({
      apiKey: 'server-secret', baseUrl: 'https://provider.example/v1', model: 'model', timeoutMs: 5,
      fetchImpl: async (_url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }),
    });
    await assert.rejects(timedOut.generateText({}), error => error.code === 'provider_timeout');
  });

  test('rejects empty and oversized provider output', () => {
    assert.throws(() => validateProviderOutput({ text: '' }), error => error.code === 'invalid_output');
    assert.throws(() => validateProviderOutput({ text: 'x'.repeat(5_001) }), error => error.code === 'oversized_output');
  });
});
