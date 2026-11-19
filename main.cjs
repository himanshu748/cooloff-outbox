const path = require('node:path');
const fs = require('node:fs/promises');
const { app, BrowserWindow, ipcMain, shell, clipboard } = require('electron');
const { messageUrl, copyPayload } = require('./handoff.cjs');
const { bindSmartSpectraIpc } = require('@smartspectra/node-sdk/main');
const native = require('@smartspectra/node-sdk');
const { createReadiness } = require('./readiness.cjs');
const readiness = createReadiness(
  native.SmartSpectraSDK,
  native.CameraSelection,
  native,
);
let win;
let consent = false;
app.commandLine.appendSwitch('disable-http-cache');
if (process.env.COOLOFF_FAKE_CAMERA) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch(
    'use-file-for-fake-video-capture',
    path.resolve(process.env.COOLOFF_FAKE_CAMERA),
  );
}
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1400,
    height: 960,
    minWidth: 1040,
    minHeight: 740,
    backgroundColor: '#f4f0e7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: 'cooloff-memory',
    },
  });
  const s = win.webContents.session;
  const local = (wc) =>
    wc === win.webContents &&
    wc.getURL() ===
      require('node:url').pathToFileURL(path.join(__dirname, 'index.html'))
        .href;
  s.setPermissionRequestHandler((wc, p, cb, d) =>
    cb(
      consent &&
        local(wc) &&
        p === 'media' &&
        d.mediaTypes?.length === 1 &&
        d.mediaTypes[0] === 'video',
    ),
  );
  s.setPermissionCheckHandler(
    (wc, p, o, d) =>
      consent && local(wc) && p === 'media' && d.mediaType === 'video',
  );
  bindSmartSpectraIpc(win);
  const trusted = (event) =>
    event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame;
  ipcMain.handle('cooloff:consent', (event, value) => {
    if (trusted(event)) {
      consent = value === true;
      if (!consent) return readiness.cancel();
    }
  });
  ipcMain.handle('cooloff:readiness', (event, options) => {
    if (!trusted(event) || !consent)
      throw new Error('Camera consent is required.');
    if (
      !options ||
      typeof options.apiKey !== 'string' ||
      typeof options.cameraName !== 'string' ||
      typeof options.breathingOnly !== 'boolean' ||
      (options.excludedMetrics !== undefined &&
        (!Array.isArray(options.excludedMetrics) ||
          !options.excludedMetrics.every((metric) =>
            [
              native.MetricType.ARTERIAL_PRESSURE_TRACE,
              native.MetricType.EXPRESSIONS,
            ].includes(metric),
          ))) ||
      ![
        native.FrameTransform.kNone,
        native.FrameTransform.kRotate90CW,
        native.FrameTransform.kRotate180,
        native.FrameTransform.kRotate90CCW,
      ].includes(options.frameTransform)
    )
      throw new Error('Invalid readiness configuration.');
    return readiness.check(options);
  });
  ipcMain.handle('cooloff:key', (event) =>
    trusted(event) ? process.env.SMARTSPECTRA_API_KEY || '' : '',
  );
  ipcMain.handle('cooloff:send', async (event, fields) => {
    if (!trusted(event)) throw Error('Untrusted sender');
    await shell.openExternal(messageUrl(fields));
    return true;
  });
  ipcMain.handle('cooloff:copy', (event, text) => {
    if (!trusted(event)) throw Error('Untrusted sender');
    clipboard.writeText(copyPayload(text));
    return true;
  });
  ipcMain.handle('cooloff:counter', async (event, action, heldSeconds = 0) => {
    if (
      !trusted(event) ||
      !['read', 'add', 'delete'].includes(action) ||
      !Number.isFinite(heldSeconds) ||
      heldSeconds < 0 ||
      heldSeconds > 180
    )
      throw Error('Invalid counter request');
    const file = path.join(app.getPath('userData'), 'cooled-counter.json');
    if (action === 'delete') {
      await fs.rm(file, { force: true });
      return { count: 0, seconds: 0 };
    }
    let value = { count: 0, seconds: 0 };
    try {
      const stored = JSON.parse(await fs.readFile(file, 'utf8'));
      if (
        Number.isSafeInteger(stored.count) &&
        stored.count >= 0 &&
        Number.isFinite(stored.seconds) &&
        stored.seconds >= 0
      )
        value = stored;
    } catch {}
    if (action === 'add') {
      value.count++;
      value.seconds += heldSeconds;
      await fs.mkdir(app.getPath('userData'), { recursive: true });
      await fs.writeFile(file, JSON.stringify(value), { mode: 0o600 });
    }
    return value;
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('did-finish-load', () =>
    console.log('Cool-off Outbox: consent screen ready; camera not requested.'),
  );
  win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
