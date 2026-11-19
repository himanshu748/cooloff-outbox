const THRESHOLD = 40;
const clamp = (n, max = 1) => Math.max(0, Math.min(max, n));
const confident = (s) =>
  Boolean(s && Number.isFinite(s.value) && s.confidence >= 0.5);

function textHeat(text = '') {
  const letters = text.match(/[a-z]/gi) || [];
  const upper = text.match(/[A-Z]/g) || [];
  const caps = letters.length >= 8 ? upper.length / letters.length : 0;
  const punctuation = (text.match(/[!?]{2,}/g) || []).length;
  const hostile = (
    text
      .toLowerCase()
      .match(/\b(idiot|stupid|moron|hate|useless|incompetent|pathetic)\b/g) ||
    []
  ).length;
  return Math.round(
    clamp(caps > 0.65 ? (caps - 0.65) / 0.35 : 0) * 15 +
      clamp(punctuation / 2) * 10 +
      clamp(hostile / 2) * 20,
  );
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
function heatScore({
  baseline,
  pulse,
  breathing,
  expressions = [],
  text = '',
} = {}) {
  let score = textHeat(text);
  if (baseline && baseline.pulse > 0 && confident(pulse))
    score += 30 * clamp((pulse.value - baseline.pulse) / 30);
  if (baseline && baseline.breathing > 0 && confident(breathing))
    score += 25 * clamp((breathing.value - baseline.breathing) / 12);
  const hostile = expressions.filter(
    (s) => /^(angry|anger|contempt|disgust)$/i.test(s.name) && confident(s),
  );
  score += 25 * Math.max(0, ...hostile.map((s) => clamp(s.value)));
  return Math.round(clamp(score, 100));
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
  Baseline,
  CoolingHold,
  confident,
};
