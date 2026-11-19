const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function cardsContainer() {
  let cards = new Map();
  return {
    get innerHTML() {
      return [...cards.values()].map((card) => card.html).join('');
    },
    set innerHTML(html) {
      cards = new Map(
        [
          ...html.matchAll(/<article data-hold="(\d+)"[\s\S]*?<\/article>/g),
        ].map(([html, id]) => {
          const children = new Map();
          const card = {
            html,
            style: { setProperty() {} },
            querySelector(selector) {
              if (!children.has(selector)) {
                const action = selector.match(/data-action="(.*?)"/);
                const pattern = action
                  ? new RegExp(
                      '(<button[^>]*data-action="' +
                        action[1] +
                        '"[^>]*>)([\\s\\S]*?)(</button>)',
                    )
                  : new RegExp(
                      '(<(?:span|p) class="' +
                        selector.slice(1) +
                        '">)([\\s\\S]*?)(</(?:span|p)>)',
                    );
                children.set(selector, {
                  attributes: {},
                  setAttribute(name, value) {
                    this.attributes[name] = value;
                  },
                  get textContent() {
                    return card.html.match(pattern)?.[2] || '';
                  },
                  set textContent(text) {
                    card.html = card.html.replace(
                      pattern,
                      (_, open, old, close) =>
                        open +
                        String(text)
                          .replaceAll('&', '&amp;')
                          .replaceAll('<', '&lt;') +
                        close,
                    );
                  },
                });
              }
              return children.get(selector);
            },
          };
          return [id, card];
        }),
      );
    },
    querySelector(selector) {
      return cards.get(selector.match(/data-hold="(\d+)"/)[1]) || null;
    },
  };
}
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
  nodes.set('cards', cardsContainer());
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
test('heated example fills all fields, confirms replacements, and captures a stable text-only hold reason', async () => {
  let approved = false,
    requests = 0;
  const a = app({
    confirm: () => {
      requests++;
      return approved;
    },
  });
  a.$('try-example').onclick();
  assert.equal(requests, 0);
  assert.equal(a.$('to').value, 'teammate@example.com');
  assert.match(a.$('feedback').textContent, /Staged workplace example/);
  assert.equal(a.$('heat-number').textContent, '45 / 100');
  assert.match(a.$('why-pulse-line').textContent, /camera off/);
  assert.match(a.$('why-breathing-line').textContent, /camera off/);
  assert.match(a.$('why-expression-line').textContent, /camera off/);
  assert.equal(a.$('why-text').style.width, '45%');
  assert.match(a.$('why-text-line').textContent, /45 pts/);
  a.$('send').onclick();
  const card = a.$('cards').querySelector('[data-hold="1"]');
  const reason = card.querySelector('.held-because').textContent;
  assert.match(reason, /Held because: ALL CAPS/);
  assert.match(reason, /“useless”/);
  assert.match(reason, /45\/100 at hold/);
  a.$('body').value = 'A fresh calm request';
  a.tick(10000);
  assert.equal(card.querySelector('.held-because').textContent, reason);
  assert.equal(a.$('cards').querySelector('[data-hold="1"]'), card);
  for (const field of ['to', 'subject', 'body']) {
    for (const id of ['to', 'subject', 'body']) a.$(id).value = '';
    a.$(field).value = 'Unsaved';
    a.$('try-example').onclick();
    assert.equal(a.$(field).value, 'Unsaved');
  }
  assert.equal(requests, 3);
  approved = true;
  a.$('try-example').onclick();
  assert.equal(a.$('to').value, 'teammate@example.com');
  assert.match(a.$('body').value, /DEADLINE/);
  assert.equal(a.sent.length, 0);
  assert.equal(a.copied.length, 0);
});
test('ticks preserve card and button identity and preview scroll while updating controls', async () => {
  const a = app();
  await a.fill('YOU USELESS IDIOT!!! WHY??');
  a.$('send').onclick();
  const card = a.$('cards').querySelector('[data-hold="1"]');
  const edit = card.querySelector('[data-action="edit"]');
  const preview = card.querySelector('.message-preview');
  preview.scrollTop = 52;
  const override = card.querySelector('[data-action="override"]');
  assert.equal(override.disabled, true);
  a.tick(10000);
  assert.equal(a.$('cards').querySelector('[data-hold="1"]'), card);
  assert.equal(card.querySelector('[data-action="edit"]'), edit);
  assert.equal(card.querySelector('.message-preview'), preview);
  assert.equal(preview.scrollTop, 52);
  assert.equal(override.disabled, false);
  assert.equal(override.textContent, 'Send anyway');
  assert.match(card.querySelector('.card-time').textContent, /10s/);
  a.tick(30000);
  assert.equal(card.querySelector('[data-action="edit"]'), edit);
  assert.equal(card.querySelector('[data-action="deliver"]').disabled, false);
  assert.match(card.querySelector('.card-state').textContent, /Timer complete/);
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
  assert.match(
    a.$('cards').innerHTML,
    /Released before cooling \(Send anyway\)/,
  );
  assert.match(
    a.$('cards').innerHTML,
    /Mail draft opened; not sent automatically/,
  );
  await a.click('delete');
  a.$('body').value = 'YOU USELESS IDIOT!!! WHY??';
  a.$('subject').value = 'FOLLOW UP';
  a.$('send').onclick();
  await a.click('delete', 2);
  assert.equal(a.$('cards').innerHTML, '');
});
test('receipt trace and summary update on the same card and stop after timer unlock', async () => {
  const a = app();
  a.$('try-example').onclick();
  a.$('send').onclick();
  const card = a.$('cards').querySelector('[data-hold="1"]');
  const trace = card.querySelector('.receipt-trace');
  const initial = trace.attributes.points;
  assert.equal(card.querySelector('.receipt').hidden, true);
  for (let t = 1000; t <= 30000; t += 1000) a.tick(t);
  assert.equal(a.$('cards').querySelector('[data-hold="1"]'), card);
  assert.equal(card.querySelector('.receipt-trace'), trace);
  assert.notEqual(trace.attributes.points, initial);
  assert.equal(trace.attributes.points.split(' ').length, 31);
  assert.equal(card.querySelector('.receipt').hidden, false);
  assert.match(
    card.querySelector('.receipt-summary').textContent,
    /Timer-only pause · text heat 45 → 45 in 30 s/,
  );
  assert.doesNotMatch(
    card.querySelector('.receipt-summary').textContent,
    /pulse|breathing/,
  );
  const frozen = trace.attributes.points;
  a.tick(60000);
  assert.equal(trace.attributes.points, frozen);
  assert.equal(a.sent.length, 0);
});
test('unlocked and released-early headers freeze at the receipt duration', async () => {
  for (const [end, override, duration] of [
    [30000, false, '30 s'],
    [10000, true, '10 s'],
    [180000, false, '3 m 0 s'],
  ]) {
    const a = app();
    a.$('try-example').onclick();
    a.$('send').onclick();
    const card = a.$('cards').querySelector('[data-hold="1"]');
    a.tick(end);
    if (override) await a.click('override');
    const expected = `✓ ${override ? 'Released early' : 'Ready when you are'} · held ${duration}`;
    assert.equal(card.querySelector('.card-time').textContent, expected);
    const receipt = card.querySelector('.receipt-summary').textContent;
    assert.ok(receipt.includes(`in ${duration}`));
    a.tick(end + 65000);
    assert.equal(a.$('cards').querySelector('[data-hold="1"]'), card);
    assert.equal(card.querySelector('.card-time').textContent, expected);
    assert.equal(card.querySelector('.receipt-summary').textContent, receipt);
  }
});
test('confident non-heat expressions appear in Why but not frozen hold reasons', () => {
  for (const [type, name] of [
    [8, 'surprise'],
    [5, 'happy'],
    [6, 'neutral'],
  ]) {
    const a = app();
    a.ui.samples(
      { face: { expression: [{ scores: [{ type, confidence: 96 }] }] } },
      true,
    );
    a.tick(1000);
    assert.equal(
      a.$('why-expression-line').textContent,
      `Expression · ${name} 96% · not a heat cue · 0 pts`,
    );
    a.$('try-example').onclick();
    a.$('send').onclick();
    const reason = a
      .$('cards')
      .querySelector('[data-hold="1"]')
      .querySelector('.held-because').textContent;
    assert.match(reason, /Held because: ALL CAPS/);
    assert.doesNotMatch(reason, /surprise|happy|neutral|face estimate/);
    a.ui.samples(
      { face: { expression: [{ scores: [{ type: 1, confidence: 90 }] }] } },
      true,
    );
    a.tick(2000);
    assert.match(
      a.$('why-expression-line').textContent,
      /angry 90% · 22.5 pts/,
    );
    assert.equal(
      a
        .$('cards')
        .querySelector('[data-hold="1"]')
        .querySelector('.held-because').textContent,
      reason,
    );
    a.ui.samples(
      { face: { expression: [{ scores: [{ type, confidence: 49 }] }] } },
      true,
    );
    a.tick(3000);
    assert.equal(
      a.$('why-expression-line').textContent,
      'Expression · no confident data',
    );
  }
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
