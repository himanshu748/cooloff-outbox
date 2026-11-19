const { test } = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('../package.json');

test('each desktop target ships its native closure outside ASAR in the SDK resolver path', () => {
  for (const [os, platform, arch, target] of [
    ['linux', 'linux', 'x64', 'AppImage'],
    ['win', 'win32', 'x64', 'portable'],
    ['mac', 'darwin', 'arm64', 'dmg'],
  ]) {
    assert.deepEqual(build[os].target, [{ target, arch: [arch] }]);
    const directory = `node_modules/@smartspectra/node-sdk-${platform}-\${arch}/`;
    assert.deepEqual(build[os].extraResources, [
      { from: directory, to: directory },
    ]);
  }
  assert.equal(build.asar, true);
  assert.ok(build.asarUnpack.includes('node_modules/koffi/**/*'));
  assert.ok(
    build.files.includes('!node_modules/@smartspectra/node-sdk-*/**/*'),
  );
  for (const file of ['main.cjs', 'preload.cjs', 'dist/renderer.js'])
    assert.ok(build.files.includes(file));
  assert.match(
    build.mac.extendInfo.NSCameraUsageDescription,
    /consent.*camera/,
  );
  assert.equal(build.mac.identity, null);
});
