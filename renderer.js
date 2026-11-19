const {
  SmartSpectraSDK,
  ProcessingStatus,
  ValidationCode,
  FrameTransform,
  SmartSpectraErrorCode,
  MetricType,
  breathingMetrics,
  cardioMetrics,
  faceMetrics,
} = require('@smartspectra/node-sdk/renderer');
const { decodeMetrics } = require('@smartspectra/node-sdk/messages');
const { ExhaleDetector, marginalia, timestampMs } = require('./signals.cjs');
const { nextRecovery } = require('./recovery.cjs');
const { mountOutbox } = require('./outbox-ui.cjs');
const $ = (id) => document.getElementById(id);
let breath = new ExhaleDetector();
let checking = false;
let sdk = null,
  stream = null,
  started = 0,
  starting = false,
  generation = 0,
  approved = false;
let notes = marginalia({}, 0),
  source = null,
  chestAt = -Infinity;
const cache = {},
  seen = {},
  waves = { chest: [], abdomen: [], pulse: [] };
const names = (object) =>
  Object.fromEntries(
    Object.entries(object)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => [
        v,
        k.replace(/^k/, '').replace(/([a-z])([A-Z])/g, '$1 $2'),
      ]),
  );
const statuses = names(ProcessingStatus),
  validations = names(ValidationCode);
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const fmt = (n) => Number(n).toFixed(0);
function show(screen) {
  for (const id of ['consent', 'key-screen', 'desk'])
    $(id).hidden = id !== screen;
}
function feedback(message) {
  $('feedback').textContent = message;
}
function pathFor(values, w, h) {
  if (values.length < 2) return '';
  const min = Math.min(...values),
    range = Math.max(0.001, Math.max(...values) - min);
  return values
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / range) * (h - 6)).toFixed(1)}`,
    )
    .join(' ');
}
function draw(id, series) {
  const canvas = $(id),
    c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.strokeStyle = '#d6dccd';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, canvas.height / 2);
  c.lineTo(canvas.width, canvas.height / 2);
  c.stroke();
  for (const [values, color] of series) {
    const p = pathFor(values, canvas.width, canvas.height);
    if (p) {
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.stroke(new Path2D(p));
    }
  }
}
function renderValues() {
  const fields = [
    ['Pulse', notes.pulse, 'bpm'],
    ['Breathing', notes.breathing, '/ min'],
    ['HRV · RMSSD', notes.hrv, 'ms'],
    ['Expression', notes.expression, ''],
  ];
  $('values').innerHTML = fields
    .map(
      ([label, n, unit]) =>
        `<div><dt>${label}</dt><dd>${n ? `${escape(typeof n.value === 'number' ? fmt(n.value) : n.value)} <span style="font-size:10px">${unit}</span><small>${fmt(n.confidence * 100)}% confidence</small>` : `—<small>${label.startsWith('HRV') ? 'needs 60s + confidence' : 'awaiting confidence'}</small>`}</dd></div>`,
    )
    .join('');
  if (notes.talking)
    $('values').innerHTML +=
      `<div><dt>Talking detection</dt><dd style="font-size:14px">${notes.talking.value}<small>stable SDK detection · no confidence field</small></dd></div>`;
}
function refreshNotes() {
  const current = {};
  for (const [key, entry] of Object.entries(cache))
    if (Date.now() - entry.at < 3500) {
      const [group, field] = key.split('.');
      (current[group] ||= {})[field] = entry.samples;
    }
  notes = marginalia(current, started ? Date.now() - started : 0);
  renderValues();
  outbox.samples(current, Boolean(sdk));
}
function handleMetrics(metrics) {
  for (const [group, fields] of Object.entries(metrics))
    if (fields && typeof fields === 'object')
      for (const [field, samples] of Object.entries(fields))
        if (Array.isArray(samples) && samples.length)
          cache[`${group}.${field}`] = { samples, at: Date.now() };
  refreshNotes();
  const ingest = (key, samples) => {
    const fresh = [];
    for (const sample of samples || []) {
      const ts = Number(sample.timestamp);
      if (!Number.isFinite(ts) || ts <= (seen[key] ?? -Infinity)) continue;
      seen[key] = ts;
      if (
        Number.isFinite(sample.value) &&
        (sample.confidence === undefined || sample.confidence > 0)
      ) {
        waves[key].push(sample.value);
        fresh.push(sample);
      }
    }
    waves[key] = waves[key].slice(-240);
    return fresh;
  };
  const chest = ingest('chest', metrics.breathing?.upperTrace),
    abdomen = ingest('abdomen', metrics.breathing?.lowerTrace);
  ingest('pulse', metrics.cardio?.arterialPressureTrace);
  if (chest.length) chestAt = Date.now();
  const nextSource = chest.length
    ? 'chest'
    : Date.now() - chestAt > 1500 && abdomen.length
      ? 'abdomen'
      : source;
  if (nextSource !== source) {
    breath.reset();
    source = nextSource;
  }
  $('source').textContent =
    source === 'abdomen' ? 'ABDOMEN FALLBACK' : 'LIVE BREATHING';
  for (const s of source === 'chest'
    ? chest
    : source === 'abdomen'
      ? abdomen
      : []) {
    outbox.trace(s.value);
    if (breath.push(s.value, timestampMs(s.timestamp))) outbox.exhale();
  }
  draw('breath-wave', [
    [waves.chest, '#5c795d'],
    [waves.abdomen, '#b28c6a'],
  ]);
  draw('pulse-wave', [[waves.pulse, '#b17859']]);
}
function reportError(code, message) {
  const lowFps = Number(code) === SmartSpectraErrorCode.kSustainedLowFrameRate;
  $('error').hidden = false;
  $('error').textContent = lowFps
    ? 'Measurement stopped because the camera frame rate stayed too low. Your message is preserved. Close other camera apps, then choose a breathing-only restart when you are ready.'
    : Number(code) === 13
      ? `Some requested metrics are not authorized by this key. No estimates are invented. Retry with breathing only. (${message})`
      : `Camera session could not continue: ${message}. Stop, check your key and camera, then retry.`;
  $('fallback').hidden = !lowFps && Number(code) !== 13;
}
function rotatePreview() {
  const angle = Number($('rotation').value);
  $('preview').style.transform =
    `rotate(${angle}deg) scale(${angle % 180 ? 0.5 : 1})`;
}
function selectedTransform() {
  return {
    0: FrameTransform.kNone,
    90: FrameTransform.kRotate90CW,
    180: FrameTransform.kRotate180,
    270: FrameTransform.kRotate90CCW,
  }[$('rotation').value];
}
async function openPreview(token) {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  let deviceId = $('camera-picker').value;
  const acquire = () =>
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    });
  let next;
  try {
    next = await acquire();
  } catch (error) {
    if (
      !deviceId ||
      !['NotFoundError', 'OverconstrainedError'].includes(error.name) ||
      token !== generation
    )
      throw error;
    deviceId = '';
    $('camera-picker').value = '';
    next = await acquire();
  }
  if (token !== generation) {
    next.getTracks().forEach((track) => track.stop());
    return;
  }
  stream = next;
  const selected = next.getVideoTracks()[0].getSettings().deviceId;
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(
    (item) => item.kind === 'videoinput',
  );
  if (token !== generation) return;
  $('camera-picker').replaceChildren(
    ...cameras.map((camera, index) => {
      const option = document.createElement('option');
      option.value = camera.deviceId;
      option.textContent = camera.label || `Camera ${index + 1}`;
      return option;
    }),
  );
  $('camera-picker').value = selected || deviceId;
  $('preview').srcObject = stream;
  await $('preview').play();
  if (token !== generation) return;
  $('preview-empty').hidden = true;
  $('session-tag').textContent = 'PREVIEW ONLY · CAMERA ON';
  rotatePreview();
}
async function prepare() {
  if (checking || starting || sdk) return;
  const token = generation + 1;
  await stop();
  if (token !== generation) return;
  if (!approved) return show('consent');
  try {
    await window.cooloff.consent(true);
    if (token !== generation) return;
    $('camera-setup').hidden = false;
    $('measurement-options').hidden = true;
    $('readiness-result').textContent =
      'Preview your framing, then check readiness.';
    await openPreview(token);
    if (token === generation)
      $('status').textContent = 'Camera preview only · not measuring.';
  } catch (error) {
    if (token === generation) {
      reportError(error.code, error.message);
      await stop();
    }
  }
}
async function checkReadiness(breathingOnly = false, excludedMetrics = []) {
  if (checking || sdk || !stream) return;
  checking = true;
  const token = generation;
  const cameraName = stream.getVideoTracks()[0].label;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
  $('preview').srcObject = null;
  $('preview-empty').hidden = false;
  for (const id of ['camera-picker', 'rotation', 'check-readiness'])
    $(id).disabled = true;
  $('measurement-options').hidden = true;
  $('readiness-result').textContent =
    'Checking camera readiness… Stop camera waits for the native probe to release the camera.';
  $('session-tag').textContent = 'CAMERA CHECK · NOT MEASURING';
  try {
    const result = await window.cooloff.readiness({
      apiKey: $('api-key').value.trim(),
      cameraName,
      breathingOnly,
      excludedMetrics,
      enableTelemetry: $('telemetry').checked,
      frameTransform: selectedTransform(),
    });
    if (token !== generation) return;
    const verdict = ['ready', 'limited', 'blocked', 'inconclusive'].includes(
      result.verdict,
    )
      ? result.verdict
      : 'inconclusive';
    $('readiness-result').textContent =
      `${verdict.toUpperCase()} — ${result.reason}${verdict !== 'ready' ? ' Try breathing only to reduce processing demand. An inconclusive check is not a pass; blocked full measurement must be resolved first.' : ''}`;
    $('measure-full').disabled = verdict === 'blocked' || breathingOnly;
    await openPreview(token);
    if (token === generation) $('measurement-options').hidden = false;
    return token === generation ? verdict : null;
  } catch (error) {
    if (token === generation)
      $('readiness-result').textContent =
        `INCONCLUSIVE — ${error.message}. Prepare the camera again to retry.`;
  } finally {
    checking = false;
    for (const id of ['camera-picker', 'rotation', 'check-readiness'])
      $(id).disabled = false;
  }
}
async function stop() {
  const token = ++generation;
  starting = false;
  const previous = sdk;
  sdk = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  $('preview').srcObject = null;
  $('preview-empty').hidden = false;
  $('camera-setup').hidden = true;
  $('session-tag').textContent = 'STOPPING CAMERA';
  $('start').disabled = true;
  $('start').hidden = false;
  $('status').textContent =
    'Waiting for camera release. A native readiness probe must finish before the camera is off.';
  for (const key of Object.keys(cache)) delete cache[key];
  refreshNotes();
  await window.cooloff.consent(false);
  if (previous) {
    try {
      await previous.stop();
    } catch {}
    try {
      await previous.destroy();
    } catch {}
  }
  if (token !== generation) return;
  $('session-tag').textContent = 'CAMERA OFF';
  $('start').disabled = false;
  $('status').textContent = 'Camera stopped. Your drafts are still here.';
}
async function start(breathingOnly = false, excluded = []) {
  if (starting || checking || sdk || !stream) return;
  if (!approved) {
    show('consent');
    return;
  }
  const key = $('api-key').value.trim();
  if (!key) {
    await stop();
    show('key-screen');
    $('key-hint').textContent =
      'Add your API key to start the camera. It stays in memory only.';
    return;
  }
  starting = true;
  $('start').disabled = true;
  $('start').hidden = true;
  $('error').hidden = true;
  $('fallback').hidden = true;
  const token = ++generation;
  let handlingFailure = false;
  const unavailable = () =>
    excluded
      .map((metric) =>
        metric === MetricType.ARTERIAL_PRESSURE_TRACE
          ? 'arterial waveform'
          : 'expression',
      )
      .join(', ');
  const failure = async (code, message) => {
    if (token !== generation || handlingFailure) return;
    handlingFailure = true;
    const next = breathingOnly
      ? null
      : nextRecovery(code, message, excluded, MetricType);
    if (!next) {
      reportError(code, message);
      await stop();
      return;
    }
    $('error').hidden = false;
    $('error').textContent =
      'An optional model failed. Your drafts are preserved. Retrying with one fewer optional metric; the SDK may not identify which model failed.';
    await stop();
    if (generation !== token + 1 || !approved) return;
    await prepare();
    const verdict = await checkReadiness(false, next);
    if (verdict && verdict !== 'blocked') await start(false, next);
  };
  try {
    await window.cooloff.consent(true);
    if (token !== generation) return;
    breath = new ExhaleDetector();
    outbox.resetBaseline();
    source = null;
    chestAt = -Infinity;
    for (const key of Object.keys(seen)) delete seen[key];
    for (const key of Object.keys(cache)) delete cache[key];
    for (const key of Object.keys(waves)) waves[key] = [];
    started = Date.now();
    const current = new SmartSpectraSDK({
      apiKey: key,
      requestedMetrics: breathingOnly
        ? [...breathingMetrics]
        : [...breathingMetrics, ...cardioMetrics, ...faceMetrics].filter(
            (metric) => !excluded.includes(metric),
          ),
      enableTelemetry: $('telemetry').checked,
      enableAccumulatedOutput: false,
    });
    sdk = current;
    if (excluded.length) {
      $('error').hidden = false;
      $('error').textContent =
        `Recovery session: ${unavailable()} unavailable (disabled after a processing failure). Your message is preserved. Stop and prepare again to request all signals.`;
    }
    current.useMediaStream(stream, { frameTransform: selectedTransform() });
    $('camera-setup').hidden = true;
    current.on('streamAvailable', (s) => {
      if (token !== generation) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      $('preview').srcObject = s;
      $('preview')
        .play()
        .catch(() => {});
      $('preview-empty').hidden = true;
    });
    current.on('metrics', (buf) => {
      if (token === generation) {
        try {
          handleMetrics(decodeMetrics(buf));
        } catch (e) {
          reportError('decode', e.message);
        }
      }
    });
    current.on('processingStatus', (status) => {
      if (token === generation) {
        $('status').textContent =
          `Processing: ${statuses[status] || status}${breathingOnly ? ' · breathing only; cardio & face disabled' : ''}${excluded.length ? ` · unavailable: ${unavailable()}` : ''}`;
        $('session-tag').textContent =
          status === ProcessingStatus.kRunning
            ? 'CAMERA ON · LOCAL'
            : 'SESSION ' + (statuses[status] || status).toUpperCase();
      }
    });
    current.on('validationStatus', (code, ts, hint) => {
      if (token === generation)
        $('validation').textContent =
          hint || validations[code] || `Validation ${code}`;
    });
    current.on('error', (code, message) => {
      void failure(code, message);
    });
    await current.start();
    if (token !== generation) {
      try {
        await current.destroy();
      } catch {}
    }
  } catch (e) {
    await failure(e.code, e.message);
  } finally {
    if (token === generation) starting = false;
  }
}
$('consent-next').onclick = async () => {
  approved = true;
  show('key-screen');
  $('api-key').value = await window.cooloff.key();
  if ($('api-key').value)
    $('key-hint').textContent =
      'Loaded from SMARTSPECTRA_API_KEY. Kept in memory, not saved.';
};
$('back').onclick = () => {
  approved = false;
  show('consent');
};
$('open-desk').onclick = () => {
  show('desk');
  $('body').focus();
};
$('change-key').onclick = async () => {
  await stop();
  show('key-screen');
};
$('stop').onclick = () => void stop();
$('start').onclick = () => void prepare();
$('check-readiness').onclick = () => void checkReadiness();
$('measure-full').onclick = () => void start();
$('measure-breathing').onclick = async () => {
  const verdict = await checkReadiness(true);
  if (verdict && verdict !== 'blocked') await start(true);
};
$('camera-picker').onchange = async () => {
  $('measurement-options').hidden = true;
  $('readiness-result').textContent = 'Camera changed. Check readiness again.';
  const token = ++generation;
  try {
    await openPreview(token);
  } catch (error) {
    if (token === generation) {
      reportError(error.code, error.message);
      await stop();
    }
  }
};
$('rotation').onchange = () => {
  rotatePreview();
  $('measurement-options').hidden = true;
  $('readiness-result').textContent =
    'Rotation changed. Check readiness again.';
};
$('fallback').onclick = async () => {
  await stop();
  await prepare();
  await checkReadiness(true);
};
const outbox = mountOutbox({ $, show, stop });
setInterval(refreshNotes, 1000);
renderValues();
draw('breath-wave', []);
draw('pulse-wave', []);
window.addEventListener('beforeunload', () => {
  stream?.getTracks().forEach((t) => t.stop());
  if (sdk)
    try {
      sdk.destroy();
    } catch {}
});
