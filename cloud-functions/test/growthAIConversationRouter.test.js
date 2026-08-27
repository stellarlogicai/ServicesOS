const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const {
  normalizeRoutingRequest,
  parseRouterResult,
  routeGrowthAIConversation,
} = require('../growthAIConversationRouter');

class Snapshot {
  constructor(value) {
    this.value = value;
    this.exists = value !== undefined;
  }

  data() {
    return this.value == null ? this.value : structuredClone(this.value);
  }
}

class Reference {
  constructor(documents, path) {
    this.documents = documents;
    this.path = path;
  }

  get() {
    return Promise.resolve(new Snapshot(this.documents[this.path]));
  }
}

function fakeAdmin(documents) {
  const db = {
    collection: name => ({ doc: id => new Reference(documents, `${name}/${id}`) }),
  };
  return { firestore: () => db };
}

function seed() {
  return {
    'users/admin-a': { role: 'admin', status: 'active', tenantId: 'tenant-a' },
    'users/employee-a': { role: 'employee', status: 'active', tenantId: 'tenant-a' },
    'tenants/tenant-a': { adminUsers: ['admin-a'] },
  };
}

describe('GrowthAI conversation router', () => {
  test('accepts only a tenant and bounded owner message', () => {
    assert.deepEqual(normalizeRoutingRequest({ tenantId: 'tenant-a', message: 'Help me grow this week' }), {
      tenantId: 'tenant-a', message: 'Help me grow this week',
    });
    assert.throws(() => normalizeRoutingRequest({ tenantId: 'tenant-a', message: 'hello', bookingId: 'booking-a' }), /invalid/);
    assert.throws(() => normalizeRoutingRequest({ tenantId: 'tenant-a', message: 'Email customer@example.test' }), /privacy/);
    assert.throws(() => normalizeRoutingRequest({ tenantId: 'tenant-a', message: 'Call 417-555-0123' }), /privacy/);
  });

  test('accepts only exact registered structured provider output', () => {
    assert.deepEqual(parseRouterResult('{"skillId":"marketing","confidence":0.9}'), { skillId: 'marketing', confidence: 0.9 });
    assert.throws(() => parseRouterResult('{"skillId":"publish","confidence":1}'), /invalid/);
    assert.throws(() => parseRouterResult('{"skillId":"marketing","confidence":1,"action":"send"}'), /invalid/);
    assert.throws(() => parseRouterResult('marketing'), /invalid/);
  });

  test('uses verified tenant-admin access and sends the provider no tenant or business data', async () => {
    const calls = [];
    const result = await routeGrowthAIConversation({
      admin: fakeAdmin(seed()),
      uid: 'admin-a',
      requestBody: { tenantId: 'tenant-a', message: 'Help me grow this week' },
      provider: {
        generateText: async payload => {
          calls.push(payload);
          return { text: '{"skillId":"marketing","confidence":0.88}', providerRequestId: 'router-1', modelId: 'router-model' };
        },
      },
    });

    assert.deepEqual(result, { success: true, skillId: 'marketing', confidence: 0.88 });
    assert.match(calls[0].systemInstruction, /marketing/);
    assert.match(calls[0].userPrompt, /Help me grow this week/);
    assert.doesNotMatch(JSON.stringify(calls[0]), /tenant-a|admin-a|private address|stripe_payment|payment status|photo path/i);
  });

  test('rejects unauthorized actors before the provider can route anything', async () => {
    let calls = 0;
    await assert.rejects(
      routeGrowthAIConversation({
        admin: fakeAdmin(seed()), uid: 'employee-a', requestBody: { tenantId: 'tenant-a', message: 'Help me grow this week' },
        provider: { generateText: async () => { calls += 1; return { text: '{}' }; } },
      }),
      error => error.code === 'forbidden',
    );
    assert.equal(calls, 0);
  });
});
