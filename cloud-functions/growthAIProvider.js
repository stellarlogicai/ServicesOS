const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_LENGTH = 5_000;

class GrowthAIProviderError extends Error {
  constructor(message, code = 'provider_error') {
    super(message);
    this.name = 'GrowthAIProviderError';
    this.code = code;
  }
}

function cleanProviderString(value, maxLength = 256) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validateProviderOutput(result, maxLength = DEFAULT_MAX_OUTPUT_LENGTH) {
  const text = cleanProviderString(result?.text, maxLength + 1);
  if (!text) throw new GrowthAIProviderError('The AI provider returned no usable text.', 'invalid_output');
  if (text.length > maxLength) {
    throw new GrowthAIProviderError('The AI provider response exceeded the allowed length.', 'oversized_output');
  }
  return {
    text,
    providerRequestId: cleanProviderString(result?.providerRequestId, 256) || null,
    modelId: cleanProviderString(result?.modelId, 128) || null,
  };
}

function createUnavailableGrowthAIProvider() {
  return {
    configured: false,
    async generateText() {
      throw new GrowthAIProviderError(
        'AI-assisted generation is not configured. Deterministic GrowthAI tools remain available.',
        'provider_unavailable'
      );
    },
  };
}

function createLocalMockGrowthAIProvider() {
  return {
    configured: true,
    async generateText({ actionType, userPrompt }) {
      if (userPrompt.includes('[simulate-provider-failure]')) {
        throw new GrowthAIProviderError('The local mock provider failed. Your credit was restored.', 'provider_error');
      }
      const text = actionType === 'conversation_router'
        ? JSON.stringify({ skillId: 'opportunities', confidence: 0.4 })
        : actionType === 'estimate_assistance'
        ? JSON.stringify({
            recommendedPrice: 205,
            reasoning: 'Local deterministic mock recommendation for human review.',
            assumptions: [],
            scopeSuggestions: [],
            possibleAddOns: [],
            complexityFlags: [],
          })
        : actionType === 'marketing_post'
        ? JSON.stringify({
            fullCaption: 'Local mock marketing draft for human review. Nothing was published.',
            shortCaption: 'Local mock marketing draft.',
            callToAction: 'Request a quote.',
            hashtags: '#LocalCleaning',
          })
        : `Local mock ${actionType} draft for human review. Nothing was sent or published.`;
      return validateProviderOutput({
        text,
        providerRequestId: 'local-mock-request',
        modelId: 'local-growthai-mock-v1',
      });
    },
  };
}

function createOpenAICompatibleGrowthAIProvider({
  apiKey,
  baseUrl,
  fetchImpl = global.fetch,
  model,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const resolvedApiKey = cleanProviderString(apiKey, 2_048);
  const resolvedBaseUrl = cleanProviderString(baseUrl, 1_024).replace(/\/+$/, '');
  const resolvedModel = cleanProviderString(model, 128);
  if (!resolvedApiKey || !resolvedBaseUrl || !resolvedModel || typeof fetchImpl !== 'function') {
    return createUnavailableGrowthAIProvider();
  }

  return {
    configured: true,
    async generateText({ systemInstruction, userPrompt }) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchImpl(`${resolvedBaseUrl}/responses`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resolvedApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: resolvedModel,
            instructions: systemInstruction,
            input: userPrompt,
            store: false,
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new GrowthAIProviderError('AI-assisted generation timed out. Your credit was restored.', 'provider_timeout');
        }
        throw new GrowthAIProviderError('AI-assisted generation is temporarily unavailable. Your credit was restored.');
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        throw new GrowthAIProviderError('AI-assisted generation is temporarily unavailable. Your credit was restored.');
      }

      const payload = await response.json();
      const responseText = Array.isArray(payload?.output)
        ? payload.output
          .filter(item => item?.type === 'message' && Array.isArray(item.content))
          .flatMap(item => item.content)
          .filter(item => item?.type === 'output_text')
          .map(item => item.text)
          .filter(text => typeof text === 'string')
          .join('\n')
        : '';
      return validateProviderOutput({
        text: responseText,
        providerRequestId: response.headers?.get?.('x-request-id') || payload?.id,
        modelId: payload?.model || resolvedModel,
      });
    },
  };
}

function isLocalMockGrowthAIEnvironment(env) {
  let firebaseProjectId = '';
  try {
    firebaseProjectId = JSON.parse(env.FIREBASE_CONFIG || '{}').projectId || '';
  } catch {
    firebaseProjectId = '';
  }
  const projectId = firebaseProjectId || env.GCLOUD_PROJECT;
  return env.GROWTHAI_PROVIDER_MODE === 'mock' &&
    env.FUNCTIONS_EMULATOR === 'true' &&
    projectId === 'demo-servicesos-v1-smoke-local';
}

function createGrowthAIProviderFromEnvironment(env = process.env) {
  if (isLocalMockGrowthAIEnvironment(env)) {
    return createLocalMockGrowthAIProvider();
  }
  return createOpenAICompatibleGrowthAIProvider({
    apiKey: env.GROWTHAI_PROVIDER_API_KEY,
    baseUrl: env.GROWTHAI_PROVIDER_BASE_URL,
    model: env.GROWTHAI_PROVIDER_MODEL,
  });
}

function createGrowthAIProviderFromFirebaseParameters({
  apiKeyParam,
  baseUrlParam,
  env = process.env,
  modelParam,
} = {}) {
  if (isLocalMockGrowthAIEnvironment(env)) {
    return createLocalMockGrowthAIProvider();
  }

  const resolveProvider = () => createOpenAICompatibleGrowthAIProvider({
    apiKey: apiKeyParam?.value?.(),
    baseUrl: baseUrlParam?.value?.(),
    model: modelParam?.value?.(),
  });

  return {
    get configured() {
      return resolveProvider().configured;
    },
    async generateText(request) {
      return resolveProvider().generateText(request);
    },
  };
}

module.exports = {
  DEFAULT_MAX_OUTPUT_LENGTH,
  GrowthAIProviderError,
  createGrowthAIProviderFromEnvironment,
  createGrowthAIProviderFromFirebaseParameters,
  createLocalMockGrowthAIProvider,
  createOpenAICompatibleGrowthAIProvider,
  createUnavailableGrowthAIProvider,
  validateProviderOutput,
};
