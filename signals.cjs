class ExhaleDetector {
  constructor() {
    this.reset();
  }
  reset() {
    this.lastTime = -Infinity;
    this.smooth = null;
    this.high = null;
    this.low = null;
    this.phase = 'seek';
    this.lastBreak = -Infinity;
    this.range = 0;
  }
  push(value, time) {
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(time) ||
      time <= this.lastTime
    )
      return false;
    if (time - this.lastTime > 2500) this.reset();
    this.lastTime = time;
    // Smooth frame noise; require a 15% recovery from the trough to end an exhale.
    this.smooth =
      this.smooth === null ? value : 0.25 * value + 0.75 * this.smooth;
    const y = this.smooth;
    this.high = this.high === null ? y : Math.max(y, this.high);
    this.low = this.low === null ? y : Math.min(y, this.low);
    this.range = Math.max(this.range * 0.998, this.high - this.low);
    const hysteresis = Math.max(0.0001, this.range * 0.15);
    if (this.phase === 'seek' && this.high - y > hysteresis) {
      this.phase = 'fall';
      this.low = y;
    }
    if (this.phase === 'fall') {
      this.low = Math.min(this.low, y);
      if (y - this.low > hysteresis) {
        this.phase = 'rise';
        this.high = y;
        // A 1.3s refractory period prevents small rebounds from making extra lines.
        if (time - this.lastBreak >= 1300) {
          this.lastBreak = time;
          return true;
        }
      }
    } else if (this.phase === 'rise') {
      this.high = Math.max(this.high, y);
      if (this.high - y > hysteresis) {
        this.phase = 'fall';
        this.low = y;
      }
    }
    return false;
  }
}

class BlinkDetector {
  constructor() {
    this.lastTime = -Infinity;
    this.down = null;
    this.previous = null;
    this.fired = false;
  }
  push(detected, time) {
    if (
      typeof detected !== 'boolean' ||
      !Number.isFinite(time) ||
      time <= this.lastTime
    )
      return false;
    if (time - this.lastTime > 2000) {
      this.down = null;
      this.previous = null;
      this.fired = false;
    }
    this.lastTime = time;
    if (detected) {
      if (this.down === null) {
        this.down = time;
        this.fired = false;
      }
      // 650ms distinguishes a deliberate hold; 60ms rejects short detection glitches.
      if (!this.fired && time - this.down >= 650) {
        this.fired = true;
        this.previous = null;
        return true;
      }
    } else if (this.down !== null) {
      const duration = time - this.down;
      this.down = null;
      if (this.fired) return false;
      if (duration >= 650) {
        this.previous = null;
        return true;
      }
      if (duration < 60) return false;
      if (this.previous !== null && time - this.previous <= 1000) {
        this.previous = null;
        return true;
      }
      this.previous = time;
    }
    return false;
  }
}

function eyeOpenness(points) {
  if (!Array.isArray(points) || points.length !== 478) return null;
  const distance = (a, b) => {
    const p = points[a],
      q = points[b];
    if (![p?.x, p?.y, q?.x, q?.y].every(Number.isFinite)) return NaN;
    return Math.hypot(p.x - q.x, p.y - q.y);
  };
  // SDK model card links MediaPipe numbering; two lid distances / twice eye width.
  const ratio = ([a, b, c, d, e, f]) =>
    (distance(b, f) + distance(c, e)) / (2 * distance(a, d));
  const eyes = [
    [33, 160, 158, 133, 153, 144],
    [362, 385, 387, 263, 373, 380],
  ].map(ratio);
  return eyes.every(
    (value) => Number.isFinite(value) && value >= 0 && value <= 1,
  )
    ? eyes
    : null;
}

class EyeClosureDetector {
  constructor() {
    this.lastTime = -Infinity;
    this.reset();
  }
  reset() {
    this.down = null;
    this.fired = false;
    this.available = false;
  }
  push(sample, time) {
    if (!Number.isFinite(time) || time <= this.lastTime) return false;
    if (time - this.lastTime > 250 || sample?.reset) this.reset();
    this.lastTime = time;
    const ratios = sample?.stable ? eyeOpenness(sample.value) : null;
    if (!ratios) {
      this.reset();
      return false;
    }
    this.available = true;
    // Hysteresis prevents lid jitter; 650ms is deliberate, not an ordinary blink.
    if (ratios.some((ratio) => ratio > 0.22)) {
      this.down = null;
      this.fired = false;
    } else if (ratios.every((ratio) => ratio < 0.18) && this.down === null)
      this.down = time;
    if (this.down !== null && !this.fired && time - this.down >= 650) {
      this.fired = true;
      return true;
    }
    return false;
  }
}

class DoubleBlinkDetector {
  constructor() {
    this.lastTime = -Infinity;
    this.previous = null;
    this.detected = false;
  }
  push(detected, time) {
    if (
      typeof detected !== 'boolean' ||
      !Number.isFinite(time) ||
      time <= this.lastTime
    )
      return false;
    if (time - this.lastTime > 1500) {
      this.previous = null;
      this.detected = false;
    }
    this.lastTime = time;
    const rising = detected && !this.detected;
    this.detected = detected;
    if (!rising) return false;
    const interval = time - this.previous;
    // SDK blink detections can be pulses, not continuous eyelid-closure states.
    if (this.previous !== null && interval >= 100 && interval <= 1000) {
      this.previous = null;
      return true;
    }
    this.previous = time;
    return false;
  }
}

function timestampMs(timestamp) {
  return Number(timestamp) / 1000;
}

function confident(sample, field = 'value') {
  if (!(sample?.confidence > 0) || !Number.isFinite(sample[field])) return null;
  return { value: sample[field], confidence: sample.confidence / 100 };
}
function marginalia(metrics, elapsedMs) {
  const last = (list) => list?.at(-1);
  const expression = last(metrics.face?.expression);
  const candidates = (expression?.scores || [])
    .filter((s) => s.confidence > 0)
    .slice()
    .sort((a, b) => b.confidence - a.confidence);
  const names = [
    'unspecified',
    'angry',
    'contempt',
    'disgust',
    'fear',
    'happy',
    'neutral',
    'sad',
    'surprise',
  ];
  const talking = last(metrics.face?.talking);
  return {
    pulse: confident(last(metrics.cardio?.pulseRate)),
    breathing: confident(last(metrics.breathing?.rate)),
    hrv:
      elapsedMs >= 60000 ? confident(last(metrics.cardio?.hrv), 'rmssd') : null,
    expression: candidates.length
      ? {
          value: names[candidates[0].type] || 'unspecified',
          confidence: candidates[0].confidence / 100,
        }
      : null,
    talking:
      talking?.stable && typeof talking.detected === 'boolean'
        ? { value: talking.detected ? 'talking' : 'quiet', stable: true }
        : null,
  };
}
class WordBoundaryBreak {
  constructor(timeoutMs = 1500) {
    this.timeoutMs = timeoutMs;
    this.pending = null;
  }
  request(text, time, notes, stanza = false) {
    if (this.pending) {
      this.pending.stanza ||= stanza;
      return this.update(text, time);
    }
    if (!text.trim() || !Number.isFinite(time)) return null;
    this.pending = {
      deadline: time + this.timeoutMs,
      notes: structuredClone(notes),
      stanza,
    };
    const match = /^(.*\S)\s+(\S*)$/s.exec(text.trimStart());
    if (match) return this.complete(match[1], match[2]);
    return null;
  }
  update(text, time) {
    if (!this.pending) return null;
    // Expire the request, not the word: a timeout must never cut a token in half.
    if (
      !text.trim() ||
      !Number.isFinite(time) ||
      time >= this.pending.deadline
    ) {
      this.pending = null;
      return null;
    }
    const match = /^(\S+)\s+([\s\S]*)$/.exec(text.trimStart());
    return match ? this.complete(match[1], match[2]) : null;
  }
  complete(text, remainder) {
    const { notes, stanza } = this.pending;
    this.pending = null;
    return { text, remainder, notes, stanza };
  }
}

class Manuscript {
  constructor() {
    this.lines = [];
    this.pendingStanza = false;
    this.trace = [];
  }
  finish(text, notes, stanza = false) {
    if (!text.trim()) {
      if (stanza && this.lines.length) this.pendingStanza = true;
      return false;
    }
    this.lines.push({
      text: text.trim(),
      notes: structuredClone(notes),
      trace: this.trace.slice(-160),
      stanza: this.pendingStanza,
    });
    this.trace = [];
    this.pendingStanza = stanza;
    return true;
  }
}
module.exports = {
  ExhaleDetector,
  BlinkDetector,
  marginalia,
  confident,
  Manuscript,
  timestampMs,
  eyeOpenness,
  EyeClosureDetector,
  DoubleBlinkDetector,
  WordBoundaryBreak,
};
