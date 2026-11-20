const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function demo() {
  const intervals = new Map();
  const nodes = new Map();
  let nextInterval = 0;
  const node = (id) => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {
        innerHTML: id,
        textContent: '',
        hidden: id === 'reset-demo',
        disabled: false,
        style: {},
        classList: {
          add: (...values) => values.forEach((value) => classes.add(value)),
          remove: (...values) =>
            values.forEach((value) => classes.delete(value)),
          replace: (from, to) => {
            classes.delete(from);
            classes.add(to);
          },
          contains: (value) => classes.has(value),
        },
        setAttribute() {},
        querySelector: () => node('countdown'),
        addEventListener: (event, callback) => {
          node(id)[event] = callback;
        },
      });
    }
    return nodes.get(id);
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../website/demo.js'), 'utf8'),
    {
      document: { getElementById: node },
      setInterval(callback) {
        intervals.set(++nextInterval, callback);
        return nextInterval;
      },
      clearInterval: (id) => intervals.delete(id),
    },
  );
  return {
    node,
    intervals,
    tick: () => [...intervals.values()].forEach((callback) => callback()),
  };
}

test('website demo completes a hold without sending and can be replayed', () => {
  const a = demo();
  a.node('try-demo').click();
  assert.equal(a.node('try-demo').disabled, true);
  assert.equal(a.node('reset-demo').hidden, false);
  assert.equal(a.node('demo-outbox').classList.contains('is-cooling'), true);
  for (let i = 0; i < 29; i++) a.tick();
  assert.equal(a.node('countdown').textContent, '1 seconds · timer-only demo');
  assert.equal(a.node('try-demo').disabled, true);
  a.tick();
  assert.equal(a.intervals.size, 0);
  assert.equal(a.node('try-demo').disabled, false);
  assert.equal(a.node('demo-outbox').classList.contains('is-ready'), true);
  assert.match(a.node('demo-outbox').innerHTML, /Nothing was sent/);
  a.node('try-demo').click();
  assert.equal(a.node('demo-outbox').classList.contains('is-ready'), false);
  assert.equal(a.intervals.size, 1);
});

test('reset during a hold cancels the timer and restores the original preview', () => {
  const a = demo();
  a.node('try-demo').click();
  a.tick();
  a.node('reset-demo').click();
  assert.equal(a.intervals.size, 0);
  a.tick();
  assert.equal(a.node('demo-message').innerHTML, 'demo-message');
  assert.equal(a.node('demo-outbox').innerHTML, 'demo-outbox');
  assert.equal(a.node('demo-outbox').classList.contains('is-cooling'), false);
  assert.equal(a.node('demo-meter-fill').style.width, '0%');
  assert.equal(a.node('demo-score').textContent, '0 / 100');
  assert.equal(a.node('try-demo').disabled, false);
  assert.equal(a.node('reset-demo').hidden, true);
});
