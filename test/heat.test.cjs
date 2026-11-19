const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  heatScore,
  heatBreakdown,
  textHeat,
  rewriteTip,
  Baseline,
  CoolingHold,
} = require('../heat.cjs');
const sample = (value) => ({ value, confidence: 0.9 });
test('breakdown reports scored raw evidence and dominant confident expression', () => {
  const result = heatBreakdown({
    baseline: { pulse: 82, breathing: 18 },
    pulse: sample(96),
    breathing: sample(22),
    expressions: [
      { name: 'angry', value: 0.62, confidence: 0.62 },
      { name: 'contempt', value: 0.55, confidence: 0.55 },
      { name: 'disgust', value: 0.99, confidence: 0.2 },
    ],
    text: 'YOU USELESS IDIOT!!! WHY??',
  });
  assert.equal(result.score, 83);
  assert.equal(result.parts.pulse.points, 14);
  assert.deepEqual(result.parts.pulse.evidence, {
    status: 'available',
    value: 96,
    baseline: 82,
    delta: 14,
    confidence: 0.9,
  });
  assert.equal(result.parts.breathing.evidence.delta, 4);
  assert.equal(result.parts.expression.evidence.label, 'angry');
  assert.equal(result.parts.expression.evidence.confidence, 0.62);
  assert.equal(result.parts.expression.points, 15.5);
  assert.equal(result.parts.text.evidence.capsRatio, 1);
  assert.equal(result.parts.text.evidence.repeatedPunctuation, 2);
  assert.deepEqual(result.parts.text.evidence.hostileWords, [
    'useless',
    'idiot',
  ]);
});
test('missing, low-confidence and camera-off evidence is unavailable, not a measured zero', () => {
  for (const input of [
    {},
    {
      pulse: { value: 96, confidence: 0.49 },
      breathing: sample(NaN),
      expressions: [{ name: 'angry', value: 1, confidence: 0.2 }],
    },
  ]) {
    const result = heatBreakdown(input);
    for (const name of ['pulse', 'breathing', 'expression']) {
      assert.equal(result.parts[name].points, null);
      assert.equal(result.parts[name].evidence.status, 'no confident data');
    }
    assert.equal(result.score, 0);
  }
  assert.equal(
    heatBreakdown({ pulse: sample(96) }).parts.pulse.evidence.status,
    'no baseline',
  );
  const input = {
    baseline: { pulse: 70, breathing: 15 },
    pulse: sample(100),
    breathing: sample(27),
    expressions: [{ name: 'angry', ...sample(1) }],
    text: 'YOU USELESS IDIOT!!! WHY??',
  };
  for (const mode of [{ camera: false }]) {
    const result = heatBreakdown({ ...input, ...mode });
    assert.equal(result.score, 45);
    for (const name of ['pulse', 'breathing', 'expression']) {
      assert.equal(result.parts[name].points, null);
      assert.equal(result.parts[name].evidence.status, 'camera off');
    }
  }
  const calm = heatBreakdown({
    baseline: input.baseline,
    pulse: sample(70),
    breathing: sample(15),
  });
  assert.equal(calm.parts.pulse.points, 0);
  assert.equal(calm.parts.pulse.evidence.status, 'available');
});
test('breakdown preserves the original numeric scoring across confidence, baseline and text boundaries', () => {
  const original = ({
    baseline,
    pulse,
    breathing,
    expressions = [],
    text = '',
  }) => {
    const clamp = (n) => Math.max(0, Math.min(1, n));
    const ok = (s) => s && Number.isFinite(s.value) && s.confidence >= 0.5;
    let score = textHeat(text);
    if (baseline && baseline.pulse > 0 && ok(pulse))
      score += 30 * clamp((pulse.value - baseline.pulse) / 30);
    if (baseline && baseline.breathing > 0 && ok(breathing))
      score += 25 * clamp((breathing.value - baseline.breathing) / 12);
    score +=
      25 *
      Math.max(
        0,
        ...expressions
          .filter(
            (s) => /^(angry|anger|contempt|disgust)$/i.test(s.name) && ok(s),
          )
          .map((s) => clamp(s.value)),
      );
    return Math.round(Math.max(0, Math.min(100, score)));
  };
  for (const confidence of [0, 0.49, 0.5, 0.9])
    for (const value of [NaN, 30, 70, 84.5, 100, 900])
      for (const text of ['', 'OK', 'Why??', 'YOU USELESS IDIOT!!! WHY??']) {
        const input = {
          baseline: { pulse: 70, breathing: 15 },
          pulse: { value, confidence },
          breathing: { value: value / 4, confidence },
          expressions: [{ name: 'angry', value: 0.62, confidence }],
          text,
        };
        assert.equal(heatBreakdown(input).score, original(input));
        assert.equal(heatScore(input), original(input));
      }
});
test('heat is bounded, personal and ignores uncertain / nonfinite data', () => {
  assert.equal(heatScore(), 0);
  const baseline = { pulse: 70, breathing: 15 };
  assert.equal(
    heatScore({ baseline, pulse: sample(70), breathing: sample(15) }),
    0,
  );
  assert.equal(
    heatScore({ baseline, pulse: sample(100), breathing: sample(27) }),
    55,
  );
  assert.equal(
    heatScore({
      baseline,
      pulse: { value: 120, confidence: 0.49 },
      breathing: sample(NaN),
    }),
    0,
  );
  assert.equal(
    heatScore({ baseline, pulse: sample(30), breathing: sample(8) }),
    0,
  );
  assert.equal(
    heatScore({
      baseline,
      pulse: sample(900),
      breathing: sample(900),
      expressions: [{ name: 'angry', ...sample(1) }],
      text: 'YOU USELESS IDIOT!!! WHY??',
    }),
    100,
  );
  assert.equal(
    heatScore({
      expressions: [
        { name: 'happy', ...sample(1) },
        { name: 'angry', value: 1, confidence: 0.1 },
      ],
    }),
    0,
  );
});
test('text cues use whole words, sufficient letters and a short local list', () => {
  assert.equal(textHeat(''), 0);
  assert.equal(textHeat('OK'), 0);
  assert.equal(textHeat('I appreciate your help.'), 0);
  assert.equal(textHeat('hateful moronic idiotic'), 0);
  assert.equal(textHeat('YOU USELESS IDIOT!!! WHY??'), 45);
  assert.match(rewriteTip('idiot'), /describing/);
  assert.match(rewriteTip('Why??'), /question mark/);
  assert.match(rewriteTip('PLEASE READ THIS'), /sentence case/);
  assert.match(rewriteTip(), /specific/);
});
test('baseline needs 20 confident seconds, pauses over gaps and freezes median', () => {
  const b = new Baseline();
  b.push({ pulse: sample(70), breathing: sample(15) }, 0);
  b.push(
    { pulse: sample(70), breathing: { value: 15, confidence: 0.1 } },
    1000,
  );
  assert.equal(b.elapsed, 0);
  for (let t = 5000; t <= 24000; t += 1000)
    b.push({ pulse: sample(t === 6000 ? 150 : 70), breathing: sample(15) }, t);
  assert.equal(b.value, null);
  b.push({ pulse: sample(70), breathing: sample(15) }, 25000);
  assert.deepEqual(b.value, { pulse: 70, breathing: 15 });
  b.push({ pulse: sample(99), breathing: sample(99) }, 26000);
  assert.equal(b.value.pulse, 70);
  b.reset();
  assert.equal(b.value, null);
});
test('baseline counts short confident intervals without overweighting high frame rates', () => {
  const b = new Baseline();
  for (let i = 0; i < 40; i++) {
    for (let offset = 0; offset <= 500; offset += 100)
      b.push({ pulse: sample(70), breathing: sample(15) }, i * 1000 + offset);
    b.push({}, i * 1000 + 600);
  }
  assert.deepEqual(b.value, { pulse: 70, breathing: 15 });
  assert.equal(b.elapsed, 20000);
  assert.equal(b.pulse.length, 40);
});
test('hold threshold is strict; 30 continuous seconds resets on heat or missing confidence', () => {
  const h = new CoolingHold({ body: 'draft' }, 0);
  for (let t = 0; t <= 20000; t += 1000) h.tick(t, 20);
  h.tick(21000, 40);
  assert.equal(h.belowSince, null);
  h.tick(22000, 20);
  h.tick(23000, 20, false);
  assert.equal(h.belowSince, null);
  for (let t = 24000; t < 54000; t += 1000)
    assert.equal(h.tick(t, 39), 'cooling');
  assert.equal(h.tick(54000, 39), 'unlocked');
});
test('a suspended clock cannot count as sustained cool; max hold always releases', () => {
  const h = new CoolingHold({}, 0);
  h.tick(0, 0);
  h.tick(31000, 0);
  assert.equal(h.state, 'cooling');
  assert.equal(h.belowSince, 31000);
  assert.equal(h.tick(180000, 100, false), 'unlocked');
  assert.match(h.reason, /Maximum/);
  assert.throws(() => new CoolingHold({}, NaN));
});
test('override requires 10 seconds and confirmation; terminal states do not relock', () => {
  const original = { body: 'draft' };
  const h = new CoolingHold(original, 0);
  original.body = 'changed';
  assert.equal(h.message.body, 'draft');
  assert.equal(h.override(9999, true), false);
  assert.equal(h.override(10000, false), false);
  assert.equal(h.override(10000, true), true);
  assert.equal(h.tick(20000, 100), 'unlocked');
});
test('timer-only holds unlock at 30s, never before, regardless of estimates', () => {
  const h = new CoolingHold({}, 0, { timerOnly: true });
  assert.equal(h.tick(29999, 0), 'cooling');
  assert.equal(h.tick(30000, 100, false), 'unlocked');
});
