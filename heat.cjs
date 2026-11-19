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
  const dominant = expressions
    .filter(confident)
    .reduce(
      (best, s) => (!best || clamp(s.value) > clamp(best.value) ? s : best),
      null,
    );
  const heatCue = Boolean(
    dominant && /^(angry|anger|contempt|disgust)$/i.test(dominant.name),
  );
  const parts = {
    pulse: vital(pulse, baseline?.pulse, 30, 30),
    breathing: vital(breathing, baseline?.breathing, 25, 12),
    expression: {
      points:
        unavailable || !dominant
          ? null
          : heatCue
            ? 25 * clamp(dominant.value)
            : 0,
      evidence: {
        status: unavailable || (dominant ? 'available' : 'no confident data'),
        heatCue: !unavailable && heatCue,
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
    this.samples = [];
    this.ended = null;
  }
  capture(now, heat, vitals = {}) {
    const last = this.samples.at(-1);
    if (
      this.state !== 'cooling' ||
      !Number.isFinite(now) ||
      now < this.started ||
      !Number.isFinite(heat) ||
      (last &&
        Math.floor((now - this.started) / 1000) <=
          Math.floor((last.at - this.started) / 1000))
    )
      return;
    this.samples.push({
      at: now,
      heat: Math.round(clamp(heat, 100)),
      pulse:
        !this.timerOnly && confident(vitals.pulse) ? vitals.pulse.value : null,
      breathing:
        !this.timerOnly && confident(vitals.breathing)
          ? vitals.breathing.value
          : null,
    });
    if (this.samples.length > 200)
      this.samples.splice(1, this.samples.length - 200);
  }
  tick(now, heat, reliable = true, vitals = {}) {
    if (this.state !== 'cooling' || !Number.isFinite(now) || now < this.last)
      return this.state;
    this.capture(now, heat, vitals);
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
    if (this.state === 'unlocked') this.ended = now;
    return this.state;
  }
  canOverride(now) {
    return this.state === 'cooling' && now - this.started >= 10000;
  }
  override(now, confirmed, heat, vitals) {
    if (!confirmed || !this.canOverride(now)) return false;
    this.capture(now, heat, vitals);
    this.state = 'unlocked';
    this.reason = 'Your choice: send anyway';
    this.ended = now;
    return true;
  }
  receipt() {
    if (this.state === 'cooling') return '';
    const seconds = Math.max(0, Math.floor((this.ended - this.started) / 1000));
    const elapsed =
      seconds >= 60
        ? `${Math.floor(seconds / 60)} m ${seconds % 60} s`
        : `${seconds} s`;
    const first = this.samples[0],
      last = this.samples.at(-1);
    const summary = first ? `${first.heat} → ${last.heat}` : null;
    let sentence;
    if (this.reason === 'Your choice: send anyway')
      sentence = `Released before cooling (Send anyway) · ${this.timerOnly ? 'text heat' : 'heat'} ${summary ?? 'unavailable'} in ${elapsed}`;
    else if (this.timerOnly)
      sentence = `Timer-only pause · text heat ${summary ?? 'unavailable'} in ${elapsed}`;
    else if (this.reason === 'Below threshold for 30 seconds' && first)
      sentence = `Cooled from ${first.heat} to ${last.heat} in ${elapsed}`;
    else
      sentence = `Maximum hold reached in ${elapsed} · heat ${summary ?? 'unavailable'}`;
    if (!this.timerOnly)
      for (const [name, unit] of [
        ['pulse', 'bpm'],
        ['breathing', '/min'],
      ]) {
        const readings = this.samples.filter((sample) => sample[name] !== null);
        if (readings.length)
          sentence += ` · ${name} ${Number(readings[0][name].toFixed(1))}${readings.length > 1 ? ' → ' + Number(readings.at(-1)[name].toFixed(1)) : ''}${unit === 'bpm' ? ' ' : ''}${unit}${readings.length === 1 ? ' (one confident sample)' : ''}`;
      }
    return sentence;
  }
  heatTrace() {
    const duration = Math.max(
      1000,
      (this.ended ?? this.samples.at(-1)?.at ?? this.last) - this.started,
    );
    return this.samples
      .map(
        (sample) =>
          `${(4 + (292 * (sample.at - this.started)) / duration).toFixed(1)},${(60 - sample.heat * 0.56).toFixed(1)}`,
      )
      .join(' ');
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
