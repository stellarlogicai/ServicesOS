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

  test('uses a local mock only for the exact demo project', async () => {
    const mock = createGrowthAIProviderFromEnvironment({
      FUNCTIONS_EMULATOR: 'true',
      GCLOUD_PROJECT: 'demo-servicesos-v1-smoke-local',
      GROWTHAI_PROVIDER_MODE: 'mock',
    });
    assert.equal(mock.configured, true);
    assert.match((await mock.generateText({ actionType: 'marketing_post', userPrompt: '' })).text, /Local mock/);
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
      modelParam: param('model', 'controlled-model'),
    });

    assert.deepEqual(reads, []);
    assert.equal(provider.configured, true);
    assert.deepEqual(reads, ['apiKey', 'baseUrl', 'model']);
  });

  test('keeps missing Firebase provider configuration safely unavailable', async () => {
    const emptyParam = { value: () => '' };
    const provider = createGrowthAIProviderFromFirebaseParameters({
      apiKeyParam: emptyParam,
      baseUrlParam: emptyParam,
      modelParam: emptyParam,
    });

    assert.equal(provider.configured, false);
    await assert.rejects(provider.generateText({}), error => error.code === 'provider_unavailable');
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
          json: async () => ({ id: 'response-1', model: 'controlled-model', choices: [{ message: { content: 'Generated text' } }] }),
        };
      },
    });
    const output = await provider.generateText({ systemInstruction: 'System', userPrompt: 'User' });
    assert.equal(output.text, 'Generated text');
    assert.equal(output.providerRequestId, 'request-1');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.model, 'controlled-model');
    assert.equal(body.temperature, 0.4);
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
