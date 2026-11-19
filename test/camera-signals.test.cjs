const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  EyeClosureDetector,
  DoubleBlinkDetector,
  eyeOpenness,
} = require('../signals.cjs');
const { createReadiness } = require('../readiness.cjs');

function face(ratio = 0.3) {
  const value = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
  for (const [a, b, c, d, e, f] of [
    [33, 160, 158, 133, 153, 144],
    [362, 385, 387, 263, 373, 380],
  ]) {
    value[a] = { x: 0, y: 0 };
    value[d] = { x: 10, y: 0 };
    value[b] = { x: 3, y: ratio * 5 };
    value[f] = { x: 3, y: -ratio * 5 };
    value[c] = { x: 7, y: ratio * 5 };
    value[e] = { x: 7, y: -ratio * 5 };
  }
  return { value, stable: true };
}

test('eye ratios are scale/rotation invariant; both eyes close for 650ms, once per hold', () => {
  const sample = face();
  assert.deepEqual(eyeOpenness(sample.value), [0.3, 0.3]);
  assert.deepEqual(
    eyeOpenness(sample.value.map(({ x, y }) => ({ x: -2 * y, y: 2 * x }))),
    [0.3, 0.3],
  );
  const detector = new EyeClosureDetector();
  detector.push(face(), 0);
  const hits = [];
  for (let time = 50; time <= 1300; time += 50)
    if (detector.push(face(0.1), time)) hits.push(time);
  assert.deepEqual(hits, [700]);
  detector.push(face(), 1350);
  for (let time = 1400; time < 2050; time += 50)
    assert.equal(detector.push(face(0.1), time), false);
  assert.equal(detector.push(face(0.1), 2050), true);
});

test('missing, unstable, reset, gaps, duplicate and malformed eye samples cannot bridge a closure', () => {
  assert.equal(eyeOpenness([]), null);
  assert.equal(eyeOpenness(face().value.slice(0, 468)), null);
  const malformed = face();
  malformed.value[33].x = NaN;
  assert.equal(eyeOpenness(malformed.value), null);
  for (const broken of [
    null,
    { ...face(0.1), stable: false },
    malformed,
    { ...face(0.1), reset: true },
  ]) {
    const detector = new EyeClosureDetector();
    for (let time = 0; time <= 500; time += 50) detector.push(face(0.1), time);
    assert.equal(detector.push(broken, 550), false);
    assert.equal(detector.push(face(0.1), 700), false);
    assert.equal(detector.push(face(0.1), 700), false);
    assert.equal(detector.push(face(0.1), 1500), false);
    assert.equal(detector.push(face(0.1), NaN), false);
  }
});

test('eye hysteresis rejects normal blinks and a wink', () => {
  const detector = new EyeClosureDetector();
  detector.push(face(0.1), 0);
  detector.push(face(0.1), 100);
  detector.push(face(), 200);
  const wink = face(0.1);
  const opened = face();
  for (const index of [362, 385, 387, 263, 373, 380])
    wink.value[index] = opened.value[index];
  for (let time = 250; time < 1500; time += 50)
    assert.equal(detector.push(wink, time), false);
  for (let time = 1500; time <= 2100; time += 50)
    detector.push(face(0.1), time);
  assert.equal(detector.push(face(0.2), 2150), true);
});

test('double blink accepts detection pulses but never treats a held pulse as long closure', () => {
  const detector = new DoubleBlinkDetector();
  assert.equal(detector.push(undefined, 0), false);
  assert.equal(detector.push(true, 10), false);
  assert.equal(detector.push(true, 700), false);
  detector.push(false, 750);
  assert.equal(detector.push(true, 900), true);
  assert.equal(detector.push(true, 900), false);
  detector.push(false, 1000);
  assert.equal(detector.push(true, 2500), false);
});

test('readiness uses native camera IDs, exact metric bundles and destroys on every verdict', async () => {
  for (const verdict of ['ready', 'limited', 'blocked', 'inconclusive']) {
    let options,
      selected,
      destroyed = false;
    class SDK {
      static availableCameras() {
        return [{ id: 'native-id', name: 'Desk camera' }];
      }
      constructor(value) {
        options = value;
      }
      useCamera(value) {
        selected = value;
      }
      async checkDeviceReadiness() {
        return { verdict, reason: 'Camera report' };
      }
      async destroy() {
        destroyed = true;
      }
    }
    const check = createReadiness(
      SDK,
      { byId: (id) => id },
      { breathingMetrics: [0, 1, 2], cardioMetrics: [15], faceMetrics: [11] },
    );
    assert.deepEqual(
      await check.check({
        apiKey: 'test',
        cameraName: 'Desk camera',
        breathingOnly: false,
        enableTelemetry: false,
      }),
      { verdict, reason: 'Camera report' },
    );
    assert.equal(selected, 'native-id');
    assert.equal(destroyed, true);
    assert.deepEqual(options.requestedMetrics, [0, 1, 2, 15, 11]);
    await check.check({
      apiKey: 'test',
      cameraName: 'Desk camera',
      breathingOnly: false,
      excludedMetrics: [15],
    });
    assert.deepEqual(options.requestedMetrics, [0, 1, 2, 11]);
    assert.equal(options.enableTelemetry, false);
    await check.check({
      apiKey: 'test',
      cameraName: 'Desk camera',
      breathingOnly: true,
    });
    assert.deepEqual(options.requestedMetrics, [0, 1, 2]);
  }
});

test('unmatched cameras and native errors are inconclusive; cancellation waits for probe teardown', async () => {
  let custom = false,
    destroyed = 0,
    checked = 0,
    stop;
  class SDK {
    static availableCameras() {
      return [];
    }
    useCustomInput() {
      custom = true;
    }
    checkDeviceReadiness() {
      checked++;
      return new Promise((resolve) => {
        stop = resolve;
      });
    }
    async stopAsync() {
      throw new Error('Measurement stop cannot cancel readiness');
    }
    async destroy() {
      destroyed++;
    }
  }
  const check = createReadiness(
    SDK,
    {},
    { breathingMetrics: [], cardioMetrics: [], faceMetrics: [] },
  );
  const pending = check.check({ cameraName: 'Unknown' });
  await assert.rejects(
    check.check({ cameraName: 'Unknown' }),
    /already running/,
  );
  let cancelled = false;
  const cancellation = check.cancel().then(() => {
    cancelled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, false);
  stop({ verdict: 'inconclusive' });
  await cancellation;
  assert.equal((await pending).verdict, 'inconclusive');
  assert.equal(custom, true);
  assert.equal(checked, 1);
  assert.equal(destroyed, 1);
  SDK.availableCameras = () => {
    throw new Error('No camera access');
  };
  assert.match(
    (await check.check({ cameraName: '' })).reason,
    /No camera access/,
  );
  assert.equal(destroyed, 2);
});

test('native-camera Stop waits for readiness and destroy to release the camera', async () => {
  let finishProbe, finishDestroy;
  class SDK {
    static availableCameras() {
      return [{ id: 'native', name: 'Desk' }];
    }
    useCamera() {}
    checkDeviceReadiness() {
      return new Promise((resolve) => {
        finishProbe = resolve;
      });
    }
    destroy() {
      return new Promise((resolve) => {
        finishDestroy = resolve;
      });
    }
  }
  const check = createReadiness(
    SDK,
    { byId: (id) => id },
    { breathingMetrics: [], cardioMetrics: [], faceMetrics: [] },
  );
  const pending = check.check({ cameraName: 'Desk' });
  let released = false;
  const stopping = check.cancel().then(() => {
    released = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(released, false);
  finishProbe({ verdict: 'ready', reason: 'Done' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(released, false);
  finishDestroy();
  await Promise.all([pending, stopping]);
  assert.equal(released, true);
  await check.cancel();
});
