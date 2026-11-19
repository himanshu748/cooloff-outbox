const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ExhaleDetector } = require('../signals.cjs');
const fixture = require('./real-signals.json');

test('real SDK chest replay keeps seven trough recoveries across the first twenty seconds', () => {
  const detector = new ExhaleDetector();
  const events = [];
  for (const [time, value] of fixture.chest) {
    if (detector.push(value, time)) events.push(time);
    assert.equal(detector.push(value, time), false);
  }
  assert.deepEqual(
    events,
    [1201.201, 4104.104, 6906.906, 9809.809, 12312.312, 15415.415, 18018.018],
  );
});

test('real stable eye ratios include open eyes and short bilateral closures, not a sustained hold', () => {
  let closedAt = null,
    longest = 0;
  for (const [time, left, right] of fixture.eyes) {
    assert.ok(left > 0 && left < 1 && right > 0 && right < 1);
    if (left > 0.22 || right > 0.22) closedAt = null;
    else if (left < 0.18 && right < 0.18 && closedAt === null) closedAt = time;
    if (closedAt !== null) longest = Math.max(longest, time - closedAt);
  }
  assert.ok(fixture.eyes.some(([, l, r]) => l > 0.3 && r > 0.3));
  assert.ok(fixture.eyes.some(([, l, r]) => l < 0.18 && r < 0.18));
  assert.ok(longest < 650);
});
