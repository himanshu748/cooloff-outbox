const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function desk({ onConsent, onReadiness, onAcquire } = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id))
      elements.set(id, {
        value: id === 'api-key' ? 'test-key' : id === 'rotation' ? '0' : '',
        style: {},
        hidden: false,
        checked: false,
        disabled: false,
        focus() {},
        play: async () => {},
        replaceChildren() {},
        getContext: () => ({
          clearRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
        }),
      });
    return elements.get(id);
  };
  const sessions = [],
    tracks = [],
    requests = [],
    checks = [];
  let consent = false;
  let verdict = 'ready';
  class SDK {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      sessions.push(this);
    }
    on(event, callback) {
      this.handlers[event] = callback;
    }
    useMediaStream(stream, options) {
      this.stream = stream;
      this.transform = options.frameTransform;
    }
    async start() {
      this.started = true;
    }
    async stop() {
      this.stopped = true;
    }
    destroy() {
      this.destroyed = true;
    }
  }
  const context = vm.createContext({
    require: (name) =>
      name === './outbox-ui.cjs'
        ? {
            mountOutbox: () => ({
              samples() {},
              trace() {},
              exhale() {},
              resetBaseline() {},
            }),
          }
        : name.endsWith('/renderer')
          ? {
              SmartSpectraSDK: SDK,
              ProcessingStatus: { kRunning: 3 },
              ValidationCode: {},
              FrameTransform: {
                kNone: 0,
                kRotate90CW: 1,
                kRotate180: 3,
                kRotate90CCW: 2,
              },
              SmartSpectraErrorCode: { kSustainedLowFrameRate: 14 },
              MetricType: { ARTERIAL_PRESSURE_TRACE: 16, EXPRESSIONS: 14 },
              breathingMetrics: [0, 1, 2],
              cardioMetrics: [15, 16, 17],
              faceMetrics: [11, 12, 13, 14],
            }
          : name.endsWith('/messages')
            ? { decodeMetrics: (value) => value }
            : require(`../${name.slice(2)}`),
    document: { getElementById: element, createElement: () => ({}) },
    window: {
      addEventListener() {},
      cooloff: {
        consent: async (value) => {
          consent = value;
          await onConsent?.(value);
        },
        key: async () => '',
        readiness: async (options) => {
          assert.equal(consent, true);
          assert.ok(tracks.every((track) => track.stopped));
          checks.push(options);
          if (onReadiness) return onReadiness(options);
          return { verdict, reason: 'Measured camera capability' };
        },
      },
    },
    navigator: {
      mediaDevices: {
        getUserMedia: async (options) => {
          assert.equal(consent, true);
          assert.equal(options.audio, false);
          requests.push(options);
          await onAcquire?.(options);
          const track = {
            label: 'Desk camera',
            stopped: false,
            stop() {
              this.stopped = true;
            },
            getSettings: () => ({ deviceId: 'browser-id' }),
          };
          tracks.push(track);
          return { getTracks: () => [track], getVideoTracks: () => [track] };
        },
        enumerateDevices: async () => [
          { kind: 'videoinput', deviceId: 'browser-id', label: 'Desk camera' },
        ],
      },
    },
    setInterval() {},
    Date,
    structuredClone,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../renderer.js'), 'utf8'),
    context,
  );
  return {
    element,
    sessions,
    tracks,
    requests,
    checks,
    run: (code) => vm.runInContext(code, context),
    setVerdict: (value) => {
      verdict = value;
    },
  };
}

test('Prepare recovers from a disappeared selected camera and does not retry denied permission', async () => {
  const d = desk({
    onAcquire: (options) => {
      if (options.video.deviceId?.exact === 'removed-camera')
        throw Object.assign(new Error('Camera removed'), {
          name: 'OverconstrainedError',
        });
    },
  });
  await d.element('consent-next').onclick();
  d.element('camera-picker').value = 'removed-camera';
  await d.run('prepare()');
  assert.equal(d.requests.length, 2);
  assert.equal(d.requests[1].video.deviceId, undefined);
  assert.equal(d.element('camera-picker').value, 'browser-id');
  assert.equal(d.element('camera-setup').hidden, false);
  const denied = desk({
    onAcquire: () => {
      throw Object.assign(new Error('Denied'), { name: 'NotAllowedError' });
    },
  });
  await denied.element('consent-next').onclick();
  denied.element('camera-picker').value = 'removed-camera';
  await denied.run('prepare()');
  assert.equal(denied.requests.length, 1);
});

test('Stop does not claim CAMERA OFF or reopen preview before native readiness releases the camera', async () => {
  let release, finishProbe;
  const d = desk({
    onConsent: (value) =>
      !value && finishProbe
        ? new Promise((resolve) => {
            release = resolve;
          })
        : undefined,
    onReadiness: () =>
      new Promise((resolve) => {
        finishProbe = resolve;
      }),
  });
  await d.element('consent-next').onclick();
  await d.run('prepare()');
  const pending = d.run('checkReadiness()');
  const stopping = d.run('stop()');
  assert.equal(d.element('session-tag').textContent, 'STOPPING CAMERA');
  assert.equal(d.element('start').disabled, true);
  finishProbe({ verdict: 'ready', reason: 'Done' });
  await pending;
  assert.equal(d.requests.length, 1);
  assert.equal(d.element('session-tag').textContent, 'STOPPING CAMERA');
  release();
  await stopping;
  assert.equal(d.element('session-tag').textContent, 'CAMERA OFF');
});

test('camera consent precedes preview; readiness releases tracks; selected rotation reaches measurement; low FPS preserves draft', async () => {
  const d = desk();
  await d.run('prepare()');
  assert.equal(d.requests.length, 0);
  await d.element('consent-next').onclick();
  d.element('api-key').value = 'test-key';
  d.element('open-desk').onclick();
  assert.equal(d.requests.length, 0);
  await d.run('prepare()');
  assert.equal(d.requests.length, 1);
  assert.equal(d.element('camera-picker').value, 'browser-id');
  d.element('rotation').value = '90';
  d.element('rotation').onchange();
  await d.run('checkReadiness()');
  assert.equal(d.checks[0].frameTransform, 1);
  assert.equal(d.checks[0].enableTelemetry, false);
  assert.match(d.element('preview').style.transform, /rotate\(90deg\)/);
  await d.element('measure-full').onclick();
  // Click handlers intentionally fire-and-forget; let the start continuation run.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(d.sessions[0].started, true);
  assert.equal(d.element('start').hidden, true);
  assert.equal(d.element('start').disabled, true);
  assert.equal(d.sessions[0].transform, 1);
  d.element('body').value = 'Unfinished words';
  d.sessions[0].handlers.error(14, 'Low FPS', true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(d.element('body').value, 'Unfinished words');
  assert.match(d.element('error').textContent, /frame rate stayed too low/);
  assert.equal(d.element('fallback').hidden, false);
  assert.ok(d.tracks.every((track) => track.stopped));
  assert.equal(d.sessions[0].destroyed, true);
  assert.equal(d.element('start').hidden, false);
  assert.equal(d.element('start').disabled, false);
});

test('weak readiness shows reason, blocked full mode stays disabled, breathing-only checks exact bundle', async () => {
  const d = desk();
  await d.element('consent-next').onclick();
  d.element('api-key').value = 'test-key';
  await d.run('prepare()');
  d.setVerdict('blocked');
  await d.run('checkReadiness()');
  assert.equal(d.element('measure-full').disabled, true);
  assert.match(
    d.element('readiness-result').textContent,
    /BLOCKED.*Measured camera capability/,
  );
  d.setVerdict('inconclusive');
  await d.element('measure-breathing').onclick();
  assert.equal(d.checks.at(-1).breathingOnly, true);
  assert.deepEqual(
    Array.from(d.sessions[0].options.requestedMetrics),
    [0, 1, 2],
  );
});

test('processing failure retries with one optional metric removed, preserves writing and bounds retries', async () => {
  let recovering = false;
  const d = desk({
    onReadiness: (options) => ({
      verdict:
        recovering && !options.excludedMetrics.includes(16)
          ? 'blocked'
          : 'ready',
      reason: 'Arterial model unavailable during recovery',
    }),
  });
  await d.element('consent-next').onclick();
  d.element('api-key').value = 'test-key';
  await d.run('prepare()');
  await d.run('checkReadiness()');
  await d.run('start()');
  d.element('body').value = 'Keep my unfinished words';
  recovering = true;
  for (let i = 0; i < 3; i++) {
    d.sessions.at(-1).handlers.error(8, 'processing failed');
    await new Promise((resolve) => setImmediate(resolve));
    if (i < 2) {
      assert.equal(d.sessions.length, i + 2);
      assert.ok(!d.sessions.at(-1).options.requestedMetrics.includes(16));
      assert.deepEqual(
        Array.from(d.checks.at(-1).excludedMetrics),
        i === 0 ? [16] : [16, 14],
      );
      assert.match(
        d.element('error').textContent,
        /arterial waveform.*unavailable/,
      );
    }
  }
  assert.equal(d.sessions.length, 3);
  assert.equal(d.sessions.at(-1).destroyed, true);
  assert.equal(d.element('body').value, 'Keep my unfinished words');
});
