const THRESHOLD = 40;
const clamp = (n, max = 1) => Math.max(0, Math.min(max, n));
const confident = (s) =>
  Boolean(s && Number.isFinite(s.value) && s.confidence >= 0.5);

function textEvidence(text = '') {
  const letters = text.match(/[a-z]/gi) || [];
  const upper = text.match(/[A-Z]/g) || [];
  const capsRatio = letters.length ? upper.length / letters.length : 0;
  const caps = letters.length >= 8 ? capsRatio : 0;
  const punctuation = (text.match(/[!?]{2,}/g) || []).length;
  const hostile =
    text
      .toLowerCase()
      .match(/\b(idiot|stupid|moron|hate|useless|incompetent|pathetic)\b/g) ||
    [];
  const points = Math.round(
    clamp(caps > 0.65 ? (caps - 0.65) / 0.35 : 0) * 15 +
      clamp(punctuation / 2) * 10 +
      clamp(hostile.length / 2) * 20,
  );
  return {
    points,
    evidence: {
      status: 'available',
      capsRatio,
      letterCount: letters.length,
      repeatedPunctuation: punctuation,
      hostileWords: hostile,
      capsContributed: caps > 0.65,
    },
  };
}
function textHeat(text = '') {
  return textEvidence(text).points;
}
function rewriteTip(text = '') {
  if (/\b(idiot|stupid|moron|hate|useless|incompetent|pathetic)\b/i.test(text))
    return 'Try describing what happened and what you need, rather than labeling the person.';
  if (/[!?]{2,}/.test(text))
    return 'One question mark is enough. Could you turn the accusation into a specific request?';
  if (textHeat(text) > 0)
    return 'Try sentence case, then read it once as the recipient.';
  return 'A useful check: is your request clear, specific, and kind?';
}
function heatBreakdown({
  baseline,
  pulse,
  breathing,
  expressions = [],
  text = '',
  camera = true,
} = {}) {
  const unavailable = !camera ? 'camera off' : null;
  const vital = (sample, reference, maximum, range) => {
    const status =
      unavailable ||
      (!confident(sample)
        ? 'no confident data'
        : !(reference > 0)
          ? 'no baseline'
          : 'available');
    const delta = status === 'available' ? sample.value - reference : null;
    return {
      points: delta === null ? null : maximum * clamp(delta / range),
      evidence: {
        status,
        value: confident(sample) ? sample.value : null,
        baseline: reference ?? null,
        delta,
        confidence: confident(sample) ? sample.confidence : null,
      },
    };
  };
  const hostile = expressions.filter(
    (s) => /^(angry|anger|contempt|disgust)$/i.test(s.name) && confident(s),
  );
  const dominant = hostile.reduce(
    (best, s) => (!best || clamp(s.value) > clamp(best.value) ? s : best),
    null,
  );
  const parts = {
    pulse: vital(pulse, baseline?.pulse, 30, 30),
    breathing: vital(breathing, baseline?.breathing, 25, 12),
    expression: {
      points: unavailable || !dominant ? null : 25 * clamp(dominant.value),
      evidence: {
        status: unavailable || (dominant ? 'available' : 'no confident data'),
        label: unavailable
          ? null
          : dominant?.name === 'anger'
            ? 'angry'
            : (dominant?.name ?? null),
        confidence: unavailable ? null : (dominant?.confidence ?? null),
        value: unavailable ? null : (dominant?.value ?? null),
      },
    },
    text: textEvidence(text),
  };
  let score = parts.text.points;
  for (const name of ['pulse', 'breathing', 'expression'])
    score += parts[name].points ?? 0;
  return { score: Math.round(clamp(score, 100)), parts };
}
function heatScore(input) {
  return heatBreakdown(input).score;
}
class Baseline {
  constructor() {
    this.reset();
  }
  reset() {
    this.pulse = [];
    this.breathing = [];
    this.last = null;
    this.sampled = null;
    this.elapsed = 0;
    this.value = null;
  }
  push(sample, now) {
    if (this.value || !Number.isFinite(now)) return this.value;
    if (!confident(sample.pulse) || !confident(sample.breathing)) {
      this.last = null;
      return null;
    }
    if (this.last !== null && now > this.last && now - this.last <= 2500)
      this.elapsed += now - this.last;
    if (this.last !== null && now <= this.last) return null;
    this.last = now;
    if (this.sampled === null || now - this.sampled >= 1000) {
      this.sampled = now;
      this.pulse.push(sample.pulse.value);
      this.breathing.push(sample.breathing.value);
      this.pulse = this.pulse.slice(-256);
      this.breathing = this.breathing.slice(-256);
    }
    if (this.elapsed >= 20000) {
      const median = (a) => {
        const v = [...a].sort((a, b) => a - b);
        return v[Math.floor(v.length / 2)];
      };
      this.value = {
        pulse: median(this.pulse),
        breathing: median(this.breathing),
      };
    }
    return this.value;
  }
}
class CoolingHold {
  constructor(message, now, { timerOnly = false } = {}) {
    if (!Number.isFinite(now)) throw Error('Invalid clock');
    this.message = structuredClone(message);
    this.started = now;
    this.last = now;
    this.belowSince = null;
    this.state = 'cooling';
    this.reason = '';
    this.timerOnly = timerOnly;
  }
  tick(now, heat, reliable = true) {
    if (this.state !== 'cooling' || !Number.isFinite(now) || now < this.last)
      return this.state;
    const gap = now - this.last;
    this.last = now;
    if (now - this.started >= 180000) {
      this.state = 'unlocked';
      this.reason = 'Maximum hold reached';
    } else if (this.timerOnly) {
      if (now - this.started >= 30000) {
        this.state = 'unlocked';
        this.reason = 'Timer complete';
      }
    } else if (reliable && Number.isFinite(heat) && heat < THRESHOLD) {
      if (this.belowSince === null || gap > 2500) this.belowSince = now;
      if (now - this.belowSince >= 30000) {
        this.state = 'unlocked';
        this.reason = 'Below threshold for 30 seconds';
      }
    } else this.belowSince = null;
    return this.state;
  }
  canOverride(now) {
    return this.state === 'cooling' && now - this.started >= 10000;
  }
  override(now, confirmed) {
    if (!confirmed || !this.canOverride(now)) return false;
    this.state = 'unlocked';
    this.reason = 'Your choice: send anyway';
    return true;
  }
}
module.exports = {
  THRESHOLD,
  textHeat,
  rewriteTip,
  heatScore,
  heatBreakdown,
  Baseline,
  CoolingHold,
  confident,
};
