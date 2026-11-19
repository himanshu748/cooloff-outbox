const {
  Baseline,
  CoolingHold,
  heatScore,
  rewriteTip,
  confident,
  THRESHOLD,
} = require('./heat.cjs');
function mountOutbox({ $, show, stop }) {
  const baseline = new Baseline();
  let live = {},
    camera = false,
    holds = [],
    nextId = 1;
  const notice = (text) => {
    $('feedback').textContent = text;
  };
  const fields = () => ({
    to: $('to').value.trim(),
    subject: $('subject').value,
    body: $('body').value,
  });
  const score = (message) =>
    heatScore({
      ...live,
      baseline: baseline.value,
      text: message.subject + '\n' + message.body,
    });
  const safe = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  const label = (heat) =>
    heat >= THRESHOLD ? 'heated' : heat >= 20 ? 'warm' : 'calm';
  async function deliver(message, copy = false) {
    try {
      if (copy) {
        await window.cooloff.copy(
          `To: ${message.to}\nSubject: ${message.subject}\n\n${message.body}`,
        );
        notice('Copied. You decide where to paste it.');
      } else {
        await window.cooloff.send(message);
        notice(
          'Opened your mail app. Review and send there; nothing was sent automatically.',
        );
      }
      return true;
    } catch (e) {
      notice(
        copy
          ? 'Could not copy: ' +
              e.message +
              ' — your message remains available.'
          : 'Could not open your mail app: ' +
              e.message +
              ' — try Copy instead.',
      );
      return false;
    }
  }
  let counterWork = Promise.resolve();
  function count(action, seconds) {
    counterWork = counterWork.then(async () => {
      try {
        const n = await window.cooloff.counter(action, seconds);
        $('counter-value').textContent =
          `Messages cooled: ${n.count} · minutes held: ${(n.seconds / 60).toFixed(1)}`;
      } catch {
        notice(
          'The optional local counter could not be updated. Drafts remain in memory.',
        );
      }
    });
    return counterWork;
  }
  $('no-camera').onclick = async () => {
    await stop();
    show('desk');
    notice(
      'Timer-only mode. Heated drafts pause for 30 seconds; no camera needed.',
    );
  };
  $('save-counter').onchange = () => {
    if ($('save-counter').checked) void count('read');
    else
      $('counter-value').textContent =
        'Counter off. Existing totals remain until Delete counter.';
  };
  $('delete-counter').onclick = () => {
    $('save-counter').checked = false;
    void count('delete');
  };
  $('clear-draft').onclick = () => {
    for (const id of ['to', 'subject', 'body']) $(id).value = '';
    notice('Composer cleared from memory. Cooling drafts are unchanged.');
    render();
  };
  async function submit(copy) {
    const message = fields();
    if (!message.body.trim()) {
      notice('Write a message first.');
      return;
    }
    if (score(message) < THRESHOLD) {
      await deliver(message, copy);
      return;
    }
    if (holds.length >= 20) {
      notice('Your outbox is full. Edit, copy or delete a card first.');
      return;
    }
    const hold = new CoolingHold(message, Date.now(), {
      timerOnly: !camera || !baseline.value,
    });
    hold.id = nextId++;
    hold.copy = copy;
    holds.push(hold);
    $('body').value = '';
    $('subject').value = '';
    notice(
      hold.timerOnly
        ? 'Held for a 30-second timer-only pause. You remain in control.'
        : 'Held. We will offer it back after 30 continuous seconds below 40, or 3 minutes maximum.',
    );
    render();
  }
  $('send').onclick = () => void submit(false);
  $('copy').onclick = () => void submit(true);
  for (const id of ['subject', 'body']) $(id).oninput = render;
  function render() {
    const now = Date.now(),
      heat = score(fields());
    $('heat-word').textContent = label(heat);
    $('heat-number').textContent = `${heat} / 100`;
    $('heat-gauge').value = heat;
    $('tip').textContent = rewriteTip(fields().body);
    $('baseline').textContent = !camera
      ? 'Timer-only · text cues, no camera'
      : baseline.value
        ? `Personal baseline · ${Math.round(baseline.value.pulse)} bpm / ${Math.round(baseline.value.breathing)} breaths/min`
        : `Calibrating · ${Math.floor(baseline.elapsed / 1000)} / 20 s of confident pulse + breathing`;
    $('outbox-count').textContent = String(holds.length).padStart(2, '0');
    $('cooling-empty').hidden = holds.length > 0;
    $('cards').innerHTML = holds
      .map((h) => {
        const value = score(h.message),
          previous = h.state;
        h.tick(
          now,
          value,
          camera && confident(live.pulse) && confident(live.breathing),
        );
        if (
          previous === 'cooling' &&
          h.state === 'unlocked' &&
          $('save-counter').checked
        )
          void count('add', Math.min(180, (now - h.started) / 1000));
        const elapsed = Math.max(0, Math.floor((now - h.started) / 1000));
        const sustain =
          h.belowSince === null ? 0 : Math.floor((now - h.belowSince) / 1000);
        return `<article class="cooling-card ${h.state}" style="--steam:${Math.max(0.12, value / 100)}"><div class="card-top"><span>${h.state === 'unlocked' ? '✓ Ready when you are' : '◷ Cooling'} · ${elapsed}s</span><span class="steam" aria-hidden="true">∿ ∿ ∿</span></div><h3>${safe(h.message.subject || '(No subject)')}</h3><small>To ${safe(h.message.to || '(not set)')}</small><p class="message-preview">${safe(h.message.body)}</p><p class="card-state">${h.state === 'unlocked' ? safe(h.reason) + ' · not sent' : h.timerOnly ? 'Timer-only pause · 30 seconds' : `${label(value)} · ${value}/100 · below 40 for ${sustain}/30s · max 3 min`}</p><div class="card-actions"><button data-id="${h.id}" data-action="deliver" ${h.state !== 'unlocked' ? 'disabled' : ''}>${h.copy ? 'Copy message' : 'Open mail app'} ↗</button><button data-id="${h.id}" data-action="copy" ${h.state !== 'unlocked' ? 'disabled' : ''}>Copy</button><button data-id="${h.id}" data-action="override" ${!h.canOverride(now) ? 'disabled' : ''}>Send anyway${elapsed < 10 ? ` (${10 - elapsed}s)` : ''}</button><button data-id="${h.id}" data-action="edit">Edit</button><button data-id="${h.id}" data-action="delete">Delete</button></div></article>`;
      })
      .join('');
  }
  $('cards').onclick = async (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    const h = holds.find((item) => item.id === Number(button.dataset.id));
    if (!h) return;
    const action = button.dataset.action;
    if (action === 'delete') holds = holds.filter((item) => item !== h);
    if (action === 'edit') {
      if (
        fields().body.trim() &&
        !window.confirm('Replace the current composer draft?')
      )
        return;
      for (const id of ['to', 'subject', 'body']) $(id).value = h.message[id];
      holds = holds.filter((item) => item !== h);
      $('body').focus();
      notice(
        'Editing cancels this hold. Send will recheck the edited message.',
      );
    }
    if (action === 'override' && h.canOverride(Date.now())) {
      const approved = h.override(
        Date.now(),
        window.confirm(
          'Open this message before it has cooled? Nothing sends until you confirm in your mail app, or paste the copied text.',
        ),
      );
      if (approved && (await deliver(h.message, h.copy)))
        holds = holds.filter((item) => item !== h);
    }
    if (
      (action === 'deliver' || action === 'copy') &&
      h.state === 'unlocked' &&
      (await deliver(h.message, action === 'copy' || h.copy))
    )
      holds = holds.filter((item) => item !== h);
    render();
  };
  setInterval(render, 1000);
  render();
  return {
    samples(metrics, active) {
      camera = active;
      const normalize = (s) =>
        s ? { value: s.value, confidence: s.confidence / 100 } : null;
      const names = ['', 'angry', 'contempt', 'disgust'];
      live = {
        pulse: normalize(metrics.cardio?.pulseRate?.at(-1)),
        breathing: normalize(metrics.breathing?.rate?.at(-1)),
        expressions: (metrics.face?.expression?.at(-1)?.scores || []).map(
          (s) => ({
            name: names[s.type] || 'other',
            value: s.confidence / 100,
            confidence: s.confidence / 100,
          }),
        ),
      };
      if (camera) baseline.push(live, Date.now());
    },
    resetBaseline() {
      baseline.reset();
    },
    trace(value) {
      $('breathing-ring').style.transform =
        `scale(${1 + 0.1 * Math.tanh(value)})`;
    },
    exhale() {
      $('ring-label').textContent = 'Exhale detected · let the words wait';
    },
  };
}
module.exports = { mountOutbox };
