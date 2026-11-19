const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function app({
  failSend = false,
  failCopy = false,
  confirm = () => true,
} = {}) {
  let now = 0,
    interval;
  const nodes = new Map(),
    sent = [],
    copied = [],
    consent = [];
  const $ = (id) => {
    if (!nodes.has(id))
      nodes.set(id, {
        value: '',
        textContent: '',
        innerHTML: '',
        hidden: false,
        style: {},
        focus() {},
      });
    return nodes.get(id);
  };
  const context = vm.createContext({
    module: { exports: {} },
    require: () => require('../heat.cjs'),
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    setInterval: (callback) => {
      interval = callback;
    },
    window: {
      confirm,
      cooloff: {
        copy: async (text) => {
          if (failCopy) throw Error('Clipboard unavailable');
          copied.push(text);
        },
        send: async (fields) => {
          if (failSend) throw Error('No mail handler');
          sent.push(fields);
        },
        counter: async () => ({ count: 0, seconds: 0 }),
      },
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../outbox-ui.cjs'), 'utf8'),
    context,
  );
  const ui = context.module.exports.mountOutbox({
    $,
    show: (screen) => consent.push(screen),
    stop: async () => consent.push('stopped'),
  });
  return {
    $,
    ui,
    sent,
    copied,
    consent,
    tick: (t) => {
      now = t;
      interval();
    },
    async fill(body) {
      $('to').value = 'test@example.com';
      $('subject').value = 'FOLLOW UP';
      $('body').value = body;
      $('body').oninput();
    },
    async click(action, id = 1) {
      await $('cards').onclick({
        target: { closest: () => ({ dataset: { id: String(id), action } }) },
      });
    },
  };
}
test('camera-free option stops sensing; empty input does not send; calm copy/mail explicitly hand off', async () => {
  const a = app();
  await a.$('no-camera').onclick();
  assert.deepEqual(a.consent, ['stopped', 'desk']);
  await a.$('send').onclick();
  assert.equal(a.sent.length, 0);
  await a.fill('Thanks for the update.');
  await a.$('send').onclick();
  await new Promise(setImmediate);
  assert.equal(a.sent.length, 1);
  assert.match(a.$('feedback').textContent, /nothing was sent automatically/);
  await a.$('copy').onclick();
  await new Promise(setImmediate);
  assert.equal(a.copied.length, 1);
});
test('heated messages hold safely escaped text, unlock but never auto-send, then hand off on request', async () => {
  const a = app();
  await a.fill('YOU USELESS IDIOT!!! WHY?? <SCRIPT>');
  a.$('send').onclick();
  assert.match(a.$('cards').innerHTML, /Cooling/);
  assert.match(a.$('cards').innerHTML, /&lt;SCRIPT&gt;/);
  a.tick(9999);
  await a.click('override');
  assert.doesNotMatch(a.$('cards').innerHTML, /Ready when/);
  a.tick(30000);
  assert.match(a.$('cards').innerHTML, /Ready when/);
  assert.equal(a.sent.length, 0);
  await a.click('deliver');
  assert.equal(a.sent.length, 1);
  assert.equal(a.$('cards').innerHTML, '');
});
test('mail failure keeps the unlocked message; edit and delete are available while cooling', async () => {
  const a = app({ failSend: true });
  await a.fill('YOU USELESS IDIOT!!! WHY??');
  a.$('send').onclick();
  await a.click('edit');
  assert.match(a.$('body').value, /USELESS/);
  assert.equal(a.$('cards').innerHTML, '');
  a.$('send').onclick();
  a.tick(30000);
  await a.click('deliver', 2);
  assert.match(a.$('cards').innerHTML, /Ready when/);
  assert.match(a.$('feedback').textContent, /Could not/);
  await a.click('copy', 2);
  assert.equal(a.copied.length, 1);
  assert.equal(a.$('cards').innerHTML, '');
});
test('editing confirms replacement of recipient-only or subject-only drafts, but not an empty composer', async () => {
  for (const field of ['to', 'subject', 'body', null]) {
    let requests = 0,
      approved = false;
    const a = app({
      confirm: () => {
        requests++;
        return approved;
      },
    });
    await a.fill('YOU USELESS IDIOT!!! WHY??');
    a.$('send').onclick();
    for (const id of ['to', 'subject', 'body']) a.$(id).value = '';
    if (field) a.$(field).value = 'Unsaved work';
    await a.click('edit');
    assert.equal(requests, field ? 1 : 0);
    if (field) {
      assert.equal(a.$(field).value, 'Unsaved work');
      assert.match(a.$('cards').innerHTML, /Cooling/);
      approved = true;
      await a.click('edit');
    }
    assert.equal(a.$('to').value, 'test@example.com');
    assert.match(a.$('body').value, /USELESS/);
    assert.equal(a.$('cards').innerHTML, '');
  }
});
test('clipboard failure retains an unlocked draft and offers an actionable error', async () => {
  const a = app({ failCopy: true });
  await a.fill('YOU USELESS IDIOT!!! WHY??');
  a.$('copy').onclick();
  a.tick(30000);
  await a.click('copy');
  assert.equal(a.copied.length, 0);
  assert.match(a.$('cards').innerHTML, /Ready when/);
  assert.match(
    a.$('feedback').textContent,
    /Could not copy: Clipboard unavailable/,
  );
  assert.doesNotMatch(a.$('feedback').textContent, /try Copy/);
});
test('Send anyway confirms and hands off after ten seconds; Delete works during cooling', async () => {
  const a = app();
  await a.fill('YOU USELESS IDIOT!!! WHY??');
  a.$('send').onclick();
  a.tick(10000);
  await a.click('override');
  assert.equal(a.sent.length, 1);
  a.$('body').value = 'YOU USELESS IDIOT!!! WHY??';
  a.$('subject').value = 'FOLLOW UP';
  a.$('send').onclick();
  await a.click('delete', 2);
  assert.equal(a.$('cards').innerHTML, '');
});
test('SDK percentages, expression enum and 20-second personal baseline reach the composer', () => {
  const a = app();
  for (let t = 0; t <= 20000; t += 1000) {
    a.tick(t);
    a.ui.samples(
      {
        cardio: { pulseRate: [{ value: 70, confidence: 90 }] },
        breathing: { rate: [{ value: 15, confidence: 90 }] },
      },
      true,
    );
  }
  a.tick(21000);
  assert.match(a.$('baseline').textContent, /Personal baseline/);
  a.ui.samples(
    {
      cardio: { pulseRate: [{ value: 100, confidence: 90 }] },
      breathing: { rate: [{ value: 27, confidence: 90 }] },
      face: { expression: [{ scores: [{ type: 1, confidence: 80 }] }] },
    },
    true,
  );
  a.tick(22000);
  assert.equal(a.$('heat-number').textContent, '75 / 100');
  a.ui.samples({}, false);
  a.tick(23000);
  assert.match(a.$('baseline').textContent, /Timer-only/);
  assert.equal(a.$('heat-number').textContent, '0 / 100');
});
