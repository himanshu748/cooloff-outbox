const {
  SmartSpectraSDK,
  ProcessingStatus,
  breathingMetrics,
  cardioMetrics,
  faceMetrics,
} = require('@smartspectra/node-sdk');
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');
const {
  ExhaleDetector,
  DoubleBlinkDetector,
  EyeClosureDetector,
  eyeOpenness,
  timestampMs,
} = require('../signals.cjs');
async function main() {
  if (!process.env.SMARTSPECTRA_API_KEY || !process.argv[2])
    throw new Error(
      'Usage: SMARTSPECTRA_API_KEY=… npm run smoke -- /path/to/face.mp4',
    );
  const sdk = new SmartSpectraSDK({
    apiKey: process.env.SMARTSPECTRA_API_KEY,
    requestedMetrics: [...breathingMetrics, ...cardioMetrics, ...faceMetrics],
    enableTelemetry: false,
    enableAccumulatedOutput: false,
  });
  let pulse = false,
    breathing = false,
    exhales = 0,
    blinks = 0,
    failed = false,
    source = null,
    chestAt = -Infinity,
    running = false;
  const exhale = new ExhaleDetector(),
    blink = new DoubleBlinkDetector(),
    eyes = new EyeClosureDetector();
  let closures = 0;
  const readings = {},
    validation = {},
    fixture = { chest: [], eyes: [] };
  const counted = new Map();
  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
  });
  sdk.on('processingStatus', (status) => {
    console.log('processing', status);
    if (status === ProcessingStatus.kRunning) running = true;
    if (
      (running && status === ProcessingStatus.kIdle) ||
      status === ProcessingStatus.kError
    )
      settle();
  });
  sdk.on('validationStatus', (code, ts, hint) => {
    validation[code] = (validation[code] || 0) + 1;
    if (validation[code] === 1) console.log('validation', code, hint);
  });
  sdk.on('error', (code, message) => {
    console.error(
      `SDK error ${code}: ${message}${code === 13 ? ' — metric not authorized; use a key with cardio/face access' : ''}`,
    );
    failed = true;
    settle();
  });
  sdk.on('metrics', (buf) => {
    const m = decodeMetrics(buf),
      upper = m.breathing?.upperTrace || [],
      lower = m.breathing?.lowerTrace || [];
    for (const [group, fields] of Object.entries(m)) {
      if (!fields || typeof fields !== 'object') continue;
      for (const [field, samples] of Object.entries(fields)) {
        if (!Array.isArray(samples)) continue;
        const name = `${group}.${field}`;
        const stat = (readings[name] ||= {
          samples: 0,
          confident: 0,
          stable: 0,
        });
        for (const s of samples) {
          const t = Number(s.timestamp);
          if (t <= (counted.get(name) ?? -Infinity)) continue;
          counted.set(name, t);
          stat.samples++;
          if (s.confidence > 0 || s.scores?.some((x) => x.confidence > 0))
            stat.confident++;
          if (s.stable) stat.stable++;
        }
      }
    }
    for (const s of upper) {
      const t = timestampMs(s.timestamp);
      if (
        fixture.chest.length < 600 &&
        t > (fixture.chest.at(-1)?.[0] ?? -Infinity) + 90
      )
        fixture.chest.push([t, s.value]);
    }
    for (const s of m.face?.landmarks || []) {
      if (eyes.push(s, timestampMs(s.timestamp))) closures++;
      const ratio = eyeOpenness(s.value);
      if (s.stable && ratio && fixture.eyes.length < 100)
        fixture.eyes.push([timestampMs(s.timestamp), ...ratio]);
    }
    if (upper.length) chestAt = timestampMs(upper.at(-1).timestamp);
    const next = upper.length
      ? 'chest'
      : lower.length && timestampMs(lower.at(-1).timestamp) - chestAt > 1500
        ? 'abdomen'
        : source;
    if (next !== source) {
      exhale.reset();
      source = next;
    }
    for (const s of source === 'chest' ? upper : lower)
      if (exhale.push(s.value, timestampMs(s.timestamp))) {
        exhales++;
        console.log('exhale', exhales);
      }
    for (const s of m.face?.blinking || [])
      if (s.stable && blink.push(s.detected, timestampMs(s.timestamp))) {
        blinks++;
        console.log('blink gesture', blinks);
      }
    for (const s of m.cardio?.pulseRate || [])
      if (s.confidence > 0) {
        pulse = true;
      }
    if (m.breathing?.rate?.some((s) => s.confidence > 0)) breathing = true;
  });
  const timer = setTimeout(() => {
    console.error('FAIL: timed out after 180s');
    failed = true;
    settle();
  }, 180000);
  try {
    sdk.useFile(require('node:path').resolve(process.argv[2]), {
      interframeDelayMs: 40,
    });
    sdk.start();
    await done;
  } finally {
    clearTimeout(timer);
    await sdk.destroy();
  }
  console.log(
    `Summary: exhales=${exhales}, blinkGestures=${blinks}, eyeClosures=${closures}, pulse=${pulse}, breathing=${breathing}`,
  );
  console.log('Readings:', JSON.stringify(readings));
  console.log('Validation:', JSON.stringify(validation));
  const fixturePath = process.argv
    .find((arg) => arg.startsWith('--fixture='))
    ?.slice(10);
  if (fixturePath)
    require('node:fs').writeFileSync(fixturePath, JSON.stringify(fixture));
  if (failed || !pulse || !breathing)
    throw new Error(
      'FAIL: no confident pulse/breathing readings, or SDK error',
    );
  console.log('OK: real SDK pulse and breathing readings appeared');
}
if (process.argv.includes('--worker')) {
  main()
    .then(() => process.send?.({ success: true }))
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
} else {
  const child = require('node:child_process').fork(
    __filename,
    [...process.argv.slice(2), '--worker'],
    {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    },
  );
  let success = false;
  child.on('message', (message) => {
    success = message.success === true;
  });
  child.on('error', () => {
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code === 0 && success ? 0 : 1;
  });
}
