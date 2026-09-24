// Bill splitter: stateless. All money math is done in integer cents.
const PRESETS = [15, 18, 20, 25];
const state = { bill: '', tip: 18, n: 2 };

const $ = (id) => document.getElementById(id);
const fmt = (cents) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Pure calculation: tip is on the post-tax total; each share is rounded up to the next cent.
function calculate(billDollars, tipPct, people) {
  const bill = Math.round((parseFloat(billDollars) || 0) * 100);
  const tip = Math.round((bill * tipPct) / 100);
  const total = bill + tip;
  const perPerson = Math.ceil(total / people);
  return { bill, tip, total, perPerson, extra: perPerson * people - total };
}

function render() {
  const r = calculate(state.bill, state.tip, state.n);
  const has = r.bill > 0;
  $('hint').hidden = has;
  $('result').hidden = !has;
  if (has) {
    $('per').textContent = fmt(r.perPerson);
    $('detail').textContent =
      `${state.n} people · ${state.tip}% tip · total ${fmt(r.total)}`;
    $('extra').textContent = r.extra
      ? `Rounded up · payer collects ${fmt(r.extra)} extra`
      : 'Splits evenly';
  }
  document.querySelectorAll('[data-tip]').forEach((b) =>
    b.classList.toggle('on', +b.dataset.tip === state.tip));
  const custom = $('custom');
  const isCustom = !PRESETS.includes(state.tip);
  custom.classList.toggle('on', isCustom);
  if (document.activeElement !== custom) custom.value = isCustom ? state.tip : '';
  $('count').textContent = state.n;
  $('minus').disabled = state.n <= 1;
  $('plus').disabled = state.n >= 99;
}

// Bill field: allow digits and one decimal point, max two decimals.
$('bill').addEventListener('input', (e) => {
  let v = e.target.value.replace(/[^\d.]/g, '');
  const [whole, ...rest] = v.split('.');
  v = rest.length ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
  e.target.value = state.bill = v.slice(0, 10);
  render();
});
document.querySelectorAll('[data-tip]').forEach((b) =>
  b.addEventListener('click', () => { state.tip = +b.dataset.tip; render(); }));
$('custom').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  if (!isNaN(v) && v >= 0 && v <= 100) { state.tip = v; render(); }
});
$('minus').addEventListener('click', () => { state.n = Math.max(1, state.n - 1); render(); });
$('plus').addEventListener('click', () => { state.n = Math.min(99, state.n + 1); render(); });

render();
$('bill').focus();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for tests.
if (typeof module !== 'undefined') module.exports = { calculate };
