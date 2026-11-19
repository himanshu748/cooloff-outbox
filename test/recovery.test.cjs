const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nextRecovery } = require('../recovery.cjs');
const types = { ARTERIAL_PRESSURE_TRACE: 16, EXPRESSIONS: 14 };

test('optional-model recovery honors named failures and bounds unidentified failures', () => {
  assert.deepEqual(
    nextRecovery(8, 'expressions-inference failed', [], types),
    [14],
  );
  assert.deepEqual(
    nextRecovery(8, 'phasic-bp-inference failed', [], types),
    [16],
  );
  assert.deepEqual(nextRecovery(8, '', [], types), [16]);
  assert.deepEqual(nextRecovery(8, '', [16], types), [16, 14]);
  assert.equal(nextRecovery(8, '', [16, 14], types), null);
  assert.equal(
    nextRecovery(8, 'phasic-bp-inference failed', [16], types),
    null,
  );
  for (const code of [undefined, 2, 5, 13, 14])
    assert.equal(nextRecovery(code, 'processing failed', [], types), null);
});

test('smoke supervisor returns failure without a key', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(
    process.execPath,
    [require.resolve('../scripts/smoke.cjs'), 'missing.mp4'],
    {
      env: { ...process.env, SMARTSPECTRA_API_KEY: '' },
      encoding: 'utf8',
      timeout: 20000,
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});
