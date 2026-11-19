const { test } = require('node:test');
const assert = require('node:assert/strict');
const { messageUrl, copyPayload } = require('../handoff.cjs');
test('mail handoff encodes all fields and cannot introduce mail headers or schemes', () => {
  const url = messageUrl({
    to: 'person@example.com',
    subject: 'A & B?',
    body: 'Hello\n&bcc=other@example.com',
  });
  assert.match(url, /^mailto:person%40example.com\?/);
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('body'), 'Hello\n&bcc=other@example.com');
  assert.equal(params.get('bcc'), null);
  assert.equal(params.get('subject'), 'A & B?');
  for (const bad of [
    null,
    {},
    { to: 'javascript:alert(1)', subject: '', body: '' },
    { to: 'a@b.com', subject: 'Hey\nBcc: x', body: '' },
    { to: 'a@b.com', subject: '', body: 'x'.repeat(8001) },
  ])
    assert.throws(() => messageUrl(bad));
});
test('clipboard handoff is write-only bounded plain text; empty clearing is explicit', () => {
  assert.equal(copyPayload('Hello <script>'), 'Hello <script>');
  assert.equal(copyPayload(''), '');
  for (const bad of [null, {}, 42, 'x'.repeat(9001)])
    assert.throws(() => copyPayload(bad));
});
