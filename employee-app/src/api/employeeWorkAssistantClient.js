const { buildEmployeeFunctionUrl } = require('./employeeSessionClient');

const FUNCTION_NAME = 'employeeWorkAssistantGateway';
const QUESTION_MAX_LENGTH = 600;
const ANSWER_MAX_LENGTH = 1_500;
const RESPONSE_KINDS = new Set(['deterministic', 'explanation', 'escalation', 'insufficient', 'unavailable']);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

class EmployeeWorkAssistantClientError extends Error {
  constructor(message = 'Work Assistant is temporarily unavailable. Try again.', code = 'work_assistant_unavailable', status = 0) {
    super(message);
    this.name = 'EmployeeWorkAssistantClientError';
    this.code = code;
    this.status = status;
  }
}

function exactKeys(value, allowed, required) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return required.every(key => keys.includes(key)) && keys.every(key => allowed.includes(key));
}

function identifier(value, { optional = false } = {}) {
  if (optional && value == null) return null;
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > 128 || result.includes('/') || result === '.' || result === '..') {
    throw new EmployeeWorkAssistantClientError('Choose a valid job or checklist item.', 'invalid_request', 400);
  }
  return result;
}

function normalizeRequest({ bookingId, question, requestId, checklistItemId }) {
  const normalizedQuestion = typeof question === 'string' ? question.trim() : '';
  const normalizedRequestId = typeof requestId === 'string' ? requestId.trim() : '';
  if (!normalizedQuestion || normalizedQuestion.length > QUESTION_MAX_LENGTH || !REQUEST_ID_PATTERN.test(normalizedRequestId)) {
    throw new EmployeeWorkAssistantClientError('Enter a question about this job.', 'invalid_request', 400);
  }
  const body = {
    bookingId: identifier(bookingId),
    question: normalizedQuestion,
    requestId: normalizedRequestId,
  };
  const itemId = identifier(checklistItemId, { optional: true });
  if (itemId) body.checklistItemId = itemId;
  return body;
}

function validateResponse(payload, expectedRequestId) {
  if (!exactKeys(payload, ['success', 'kind', 'answer', 'requestId'], ['success', 'kind', 'answer', 'requestId']) ||
      payload.success !== true || !RESPONSE_KINDS.has(payload.kind) || payload.requestId !== expectedRequestId ||
      typeof payload.answer !== 'string' || !payload.answer.trim() || payload.answer.length > ANSWER_MAX_LENGTH) {
    throw new EmployeeWorkAssistantClientError();
  }
  return { kind: payload.kind, answer: payload.answer.trim(), requestId: payload.requestId };
}

function createEmployeeWorkAssistantRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `work-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

function isEmployeeWorkAssistantAccessLoss(error) {
  return error instanceof EmployeeWorkAssistantClientError &&
    ([401, 403, 404].includes(error.status) || ['unauthenticated', 'forbidden', 'job_unavailable'].includes(error.code));
}

function createEmployeeWorkAssistantClient({ auth, runtimeConfig, fetchImpl }) {
  return async function askEmployeeWorkAssistant(input) {
    const body = normalizeRequest(input || {});
    const user = auth.currentUser;
    if (!user || typeof user.getIdToken !== 'function') {
      throw new EmployeeWorkAssistantClientError('Sign in to use Work Assistant.', 'unauthenticated', 401);
    }
    let token;
    try {
      token = await user.getIdToken();
    } catch {
      throw new EmployeeWorkAssistantClientError();
    }
    let response;
    try {
      response = await fetchImpl(buildEmployeeFunctionUrl(runtimeConfig, FUNCTION_NAME), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new EmployeeWorkAssistantClientError();
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = typeof payload.code === 'string' ? payload.code : 'work_assistant_unavailable';
      const message = code === 'job_unavailable'
        ? 'This job is no longer available.'
        : 'Work Assistant is temporarily unavailable. Try again.';
      throw new EmployeeWorkAssistantClientError(message, code, response.status);
    }
    return validateResponse(payload, body.requestId);
  };
}

module.exports = {
  ANSWER_MAX_LENGTH,
  EmployeeWorkAssistantClientError,
  QUESTION_MAX_LENGTH,
  createEmployeeWorkAssistantClient,
  createEmployeeWorkAssistantRequestId,
  isEmployeeWorkAssistantAccessLoss,
  normalizeRequest,
  validateResponse,
};
