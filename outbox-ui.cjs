const {
  Baseline,
  CoolingHold,
  heatBreakdown,
  textHeat,
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
  const breakdown = (message) =>
    heatBreakdown({
      ...live,
      camera,
      baseline: baseline.value,
      text: message.subject + '\n' + message.body,
    });
  const score = (message) => breakdown(message).score;
  const holdScore = (hold) =>
    hold.timerOnly
      ? textHeat(hold.message.subject + '\n' + hold.message.body)
      : score(hold.message);
  const mayReplace = () =>
    !Object.values(fields()).some((value) => value.trim()) ||
    window.confirm('Replace the current composer draft?');
  const number = (value) => Number(value.toFixed(1));
  const textCues = (evidence) =>
    [
      evidence.capsContributed
        ? evidence.capsRatio >= 0.95
          ? 'ALL CAPS'
          : 'mostly capitals'
        : '',
      evidence.repeatedPunctuation
        ? `${evidence.repeatedPunctuation} repeated !/? groups`
        : '',
      ...evidence.hostileWords.map((word) => `“${word}”`),
    ].filter(Boolean);
  function evidenceLine(name, part) {
    const e = part.evidence;
    if (e.status !== 'available') return `${name} · ${e.status}`;
    const points = `${number(part.points)} pts`;
    if (name === 'Text')
      return `Text · ${Math.round(e.capsRatio * 100)}% capitals, ${e.repeatedPunctuation} repeated !/? groups${e.hostileWords.length ? ', ' + e.hostileWords.map((word) => `“${word}”`).join(', ') : ''} · ${points}`;
    if (name === 'Expression')
      return `Expression · ${e.label} ${Math.round(e.confidence * 100)}%${e.heatCue ? '' : ' · not a heat cue'} · ${points}`;
    const unit = name === 'Pulse' ? 'bpm' : 'breaths/min';
    return `${name} ${number(e.value)} ${unit}, ${e.delta >= 0 ? '+' : ''}${number(e.delta)} vs your baseline ${number(e.baseline)} · ${points}`;
  }
  function heldBecause(analysis) {
    const { pulse, breathing, expression, text } = analysis.parts;
    const cues = [];
    for (const [name, part, unit] of [
      ['pulse', pulse, 'bpm'],
      ['breathing', breathing, 'breaths/min'],
    ])
      if (part.points > 0)
        cues.push(`${name} +${number(part.evidence.delta)} ${unit}`);
    if (expression.points > 0)
      cues.push(
        `${expression.evidence.label} face estimate ${Math.round(expression.evidence.confidence * 100)}%`,
      );
    if (text.points > 0) cues.push(...textCues(text.evidence));
    return `Held because: ${cues.join(', ')} · ${analysis.score}/100 at hold`;
  }
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
  let renderedHolds = '';
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
  $('try-example').onclick = () => {
    if (!mayReplace()) return;
    $('to').value = 'teammate@example.com';
    $('subject').value = 'THIS DEADLINE IS NOT OK!!!';
    $('body').value =
      'THIS HANDOFF IS USELESS!!! WHY DID YOU IGNORE THE PLAN?? THIS IS STUPID. WE NEED TO TALK ABOUT THE DEADLINE.';
    notice(
      'Staged workplace example — not a real message. Send or Copy to try the Cooling outbox.',
    );
    render();
  };
  async function submit(copy) {
    const message = fields();
    if (!message.body.trim()) {
      notice('Write a message first.');
      return;
    }
    const analysis = breakdown(message);
    if (analysis.score < THRESHOLD) {
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
    hold.heldHeat = analysis;
    hold.capture(hold.started, holdScore(hold), camera ? live : {});
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
      analysis = breakdown(fields()),
      heat = analysis.score;
    const total = Object.values(analysis.parts).reduce(
      (sum, part) => sum + (part.points ?? 0),
      0,
    );
    for (const [key, part] of Object.entries(analysis.parts)) {
      const name = key[0].toUpperCase() + key.slice(1);
      $('why-' + key).style.width =
        `${((part.points ?? 0) / Math.max(100, total)) * 100}%`;
      $('why-' + key).title =
        `${name}: ${part.points === null ? part.evidence.status : number(part.points) + ' pts'}`;
      $('why-' + key + '-line').textContent = evidenceLine(name, part);
    }
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
    const holdKey = holds.map((h) => h.id).join(',');
    if (holdKey !== renderedHolds) {
      renderedHolds = holdKey;
      $('cards').innerHTML = holds
        .map(
          (h) =>
            `<article data-hold="${h.id}" class="cooling-card"><div class="card-top"><span class="card-time"></span><span class="steam" aria-hidden="true">∿ ∿ ∿</span></div><h3>${safe(h.message.subject || '(No subject)')}</h3><small>To ${safe(h.message.to || '(not set)')}</small><p class="message-preview">${safe(h.message.body)}</p><p class="held-because">${safe(heldBecause(h.heldHeat))}</p><p class="card-state"></p><section class="receipt" hidden><span class="receipt-key">Heat over the hold · dashed line: 40 · memory only</span><svg viewBox="0 0 300 64" role="img" aria-label="Heat history with threshold at 40"><line x1="4" y1="37.6" x2="296" y2="37.6" class="receipt-threshold"/><polyline class="receipt-trace" points=""/></svg><p class="receipt-summary"></p></section><div class="card-actions"><button data-id="${h.id}" data-action="deliver">${h.copy ? 'Copy message' : 'Open mail app'} ↗</button><button data-id="${h.id}" data-action="copy">Copy</button><button data-id="${h.id}" data-action="override">Send anyway</button><button data-id="${h.id}" data-action="edit">Edit</button><button data-id="${h.id}" data-action="delete">Delete</button></div></article>`,
        )
        .join('');
    }
    for (const h of holds) {
      const value = holdScore(h),
        previous = h.state;
      h.tick(
        now,
        value,
        camera && confident(live.pulse) && confident(live.breathing),
        camera ? live : {},
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
      const card = $('cards').querySelector(`[data-hold="${h.id}"]`);
      card.querySelector('.receipt').hidden = h.state !== 'unlocked';
      card
        .querySelector('.receipt-trace')
        .setAttribute('points', h.heatTrace());
      card.querySelector('.receipt-summary').textContent =
        h.receipt() + (h.handoff ? ` · ${h.handoff}` : '');
      card.className = `cooling-card ${h.state}`;
      card.style.setProperty('--steam', Math.max(0.12, value / 100));
      card.querySelector('.card-time').textContent =
        `${h.state === 'unlocked' ? '✓ Ready when you are' : '◷ Cooling'} · ${elapsed}s`;
      card.querySelector('.card-state').textContent =
        h.state === 'unlocked'
          ? h.reason + ' · not sent'
          : h.timerOnly
            ? 'Timer-only pause · 30 seconds'
            : `${label(value)} · ${value}/100 · below 40 for ${sustain}/30s · max 3 min`;
      for (const action of ['deliver', 'copy'])
        card.querySelector(`[data-action="${action}"]`).disabled =
          h.state !== 'unlocked';
      const override = card.querySelector('[data-action="override"]');
      override.disabled = !h.canOverride(now);
      override.textContent = `Send anyway${elapsed < 10 ? ` (${10 - elapsed}s)` : ''}`;
    }
  }
  $('cards').onclick = async (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    const h = holds.find((item) => item.id === Number(button.dataset.id));
    if (!h) return;
    const action = button.dataset.action;
    if (action === 'delete') holds = holds.filter((item) => item !== h);
    if (action === 'edit') {
      if (!mayReplace()) return;
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
        holdScore(h),
        camera ? live : {},
      );
      if (approved && (await deliver(h.message, h.copy)))
        h.handoff = h.copy
          ? 'Copied by your choice'
          : 'Mail draft opened; not sent automatically';
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
      const names = [
        'unspecified',
        'angry',
        'contempt',
        'disgust',
        'fear',
        'happy',
        'neutral',
        'sad',
        'surprise',
      ];
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
