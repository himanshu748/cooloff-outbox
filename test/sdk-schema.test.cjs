const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  Metrics,
  decodeMetrics,
  presage,
} = require('@smartspectra/node-sdk/messages');
const { BlinkDetector, marginalia, timestampMs } = require('../signals.cjs');

const roundTrip = (value) =>
  decodeMetrics(Metrics.encode(Metrics.fromObject(value)).finish());

test('every SDK expression enum maps to the displayed name', () => {
  const expected = [
    'UNSPECIFIED',
    'ANGRY',
    'CONTEMPT',
    'DISGUST',
    'FEAR',
    'HAPPY',
    'NEUTRAL',
    'SAD',
    'SURPRISE',
  ];
  for (const [type, name] of expected.entries()) {
    assert.equal(presage.smartspectra.ExpressionType[name], type);
    const metrics = roundTrip({
      face: { expression: [{ scores: [{ type, confidence: 75 }] }] },
    });
    assert.deepEqual(marginalia(metrics, 0).expression, {
      value: name.toLowerCase(),
      confidence: 0.75,
    });
  }
});

test('protobuf numeric confidences are percentages; HRV uses rmssd and a 60s gate', () => {
  const metrics = roundTrip({
    cardio: {
      pulseRate: [{ value: 72, confidence: 80 }],
      hrv: [{ rmssd: 38, meanNn: 830, sdnn: 42, baevsky: 12, confidence: 90 }],
    },
    breathing: { rate: [{ value: 14, confidence: 100 }] },
  });
  assert.deepEqual(marginalia(metrics, 60000).pulse, {
    value: 72,
    confidence: 0.8,
  });
  assert.deepEqual(marginalia(metrics, 60000).breathing, {
    value: 14,
    confidence: 1,
  });
  assert.equal(marginalia(metrics, 59999).hrv, null);
  assert.deepEqual(marginalia(metrics, 60000).hrv, {
    value: 38,
    confidence: 0.9,
  });
  assert.equal(
    marginalia(roundTrip({ cardio: { pulseRate: [{ value: 72 }] } }), 60000)
      .pulse,
    null,
  );
});

test('decoded blinking and talking use stable/detected, with microseconds converted to ms', () => {
  const epochUs = 1700000000000000;
  const metrics = roundTrip({
    face: {
      blinking: [
        { detected: true, stable: true, timestamp: epochUs },
        { detected: true, stable: true, timestamp: epochUs + 650000 },
        { detected: false, stable: true, timestamp: epochUs + 700000 },
      ],
      talking: [{ detected: true, stable: true, timestamp: epochUs }],
    },
  });
  const detector = new BlinkDetector();
  assert.deepEqual(
    metrics.face.blinking.map((sample) =>
      detector.push(sample.detected, timestampMs(sample.timestamp)),
    ),
    [false, true, false],
  );
  assert.equal(timestampMs(metrics.face.blinking[0].timestamp), 1700000000000);
  assert.deepEqual(marginalia(metrics, 0).talking, {
    value: 'talking',
    stable: true,
  });
  assert.equal('confidence' in metrics.face.talking[0], false);
  assert.equal(
    marginalia(
      roundTrip({ face: { talking: [{ detected: true, stable: false }] } }),
      0,
    ).talking,
    null,
  );
});
