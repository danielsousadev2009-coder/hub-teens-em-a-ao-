import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableProviders,
  testGeminiConnection,
  testMiniRootConnection,
  SUPPORTED_MODELS,
} from '../src/utils/aiProviders.js';
import { maskSecret } from '../src/utils/systemSettings.js';

test('AI Providers: secret masking protects keys from frontend and log exposure', () => {
  assert.equal(maskSecret(null), null);
  assert.equal(maskSecret(''), null);
  assert.equal(maskSecret('short'), '****');
  assert.equal(maskSecret('AIzaSyD-1234567890abcdef'), 'AIzaSy...cdef');
  assert.equal(maskSecret('sk-proj-abcdef1234567890'), 'sk-pro...7890');
});

test('AI Providers: testMiniRootConnection returns structured under_repair status', async () => {
  const result = await testMiniRootConnection('https://miniroot.example.invalid', 'key', 'default');
  assert.equal(result.success, false);
  assert.equal(result.code, 'under_repair');
  assert.equal(result.status, 'under_repair');
  assert.ok(result.message.includes('MiniRoot'));
  assert.ok(result.message.includes('Google Gemini'));
});

test('AI Providers: testGeminiConnection validates empty key gracefully', async () => {
  const emptyRes = await testGeminiConnection('');
  assert.equal(emptyRes.success, false);
  assert.equal(emptyRes.code, 'missing_key');

  const nullRes = await testGeminiConnection(null);
  assert.equal(nullRes.success, false);
  assert.equal(nullRes.code, 'missing_key');
});

test('AI Providers: supported models registry exposes Gemini and MiniRoot metadata', () => {
  assert.ok(Array.isArray(SUPPORTED_MODELS.gemini));
  assert.ok(SUPPORTED_MODELS.gemini.some(m => m.id === 'gemini-2.0-flash'));
  assert.ok(SUPPORTED_MODELS.gemini.some(m => m.id === 'gemini-1.5-flash'));

  assert.ok(Array.isArray(SUPPORTED_MODELS.miniroot));
  assert.ok(SUPPORTED_MODELS.miniroot.some(m => m.id === 'miniroot-default'));
});

test('AI Providers: availableProviders returns boolean dictionary for all providers', () => {
  const providers = availableProviders();
  assert.equal(typeof providers.gemini, 'boolean');
  assert.equal(typeof providers.miniroot, 'boolean');
  assert.equal(providers.miniroot, false); // Disabled pending repair
  assert.equal(typeof providers.groq, 'boolean');
  assert.equal(typeof providers.ollama, 'boolean');
});

