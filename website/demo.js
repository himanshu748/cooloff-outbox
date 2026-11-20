const tryButton = document.getElementById('try-demo');
const resetButton = document.getElementById('reset-demo');
const message = document.getElementById('demo-message');
const outbox = document.getElementById('demo-outbox');
const cue = document.getElementById('demo-cue');
const score = document.getElementById('demo-score');
const fill = document.getElementById('demo-meter-fill');
const original = { message: message.innerHTML, outbox: outbox.innerHTML };
let interval;
function reset() {
  clearInterval(interval);
  message.innerHTML = original.message;
  outbox.innerHTML = original.outbox;
  outbox.classList.remove('is-cooling', 'is-ready');
  cue.textContent = 'Calm';
  score.textContent = '0 / 100';
  fill.style.width = '0%';
  tryButton.disabled = false;
  resetButton.hidden = true;
}
tryButton.addEventListener('click', () => {
  reset();
  message.textContent =
    'THIS DEADLINE IS RIDICULOUS!!! This whole process is useless. WHY was nobody listening??';
  cue.textContent = 'Heated';
  score.textContent = '45 / 100';
  fill.style.width = '45%';
  let seconds = 30;
  tryButton.disabled = true;
  resetButton.hidden = false;
  outbox.classList.add('is-cooling');
  outbox.innerHTML =
    '<span class="outbox-symbol" aria-hidden="true">Ⅱ</span><strong>Taking a little pause.</strong><span class="demo-countdown">30 seconds · timer-only demo</span>';
  // Update the live region only at completion, not every second.
  const countdown = outbox.querySelector('.demo-countdown');
  countdown.setAttribute('aria-hidden', 'true');
  interval = setInterval(() => {
    seconds--;
    countdown.textContent = `${seconds} ${seconds === 1 ? 'second' : 'seconds'} · timer-only demo`;
    if (seconds <= 0) {
      clearInterval(interval);
      outbox.classList.replace('is-cooling', 'is-ready');
      outbox.innerHTML =
        '<span class="outbox-symbol" aria-hidden="true">✓</span><strong>Ready when you are.</strong><span>The pause is over. Nothing was sent.</span>';
      tryButton.disabled = false;
    }
  }, 1000);
});
resetButton.addEventListener('click', reset);
