// Shared calculator logic for all design mockups. Money is handled in integer cents.
(function () {
  const $$ = (s) => [...document.querySelectorAll(s)];
  const d = document.body.dataset;
  const s = { bill: d.bill || '', tip: +(d.tip || 18), n: +(d.n || 4) };
  const PRESETS = [15, 18, 20, 25];
  const fmt = (c) =>
    '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const set = (sel, t) => $$(sel).forEach((e) => (e.textContent = t));

  function render() {
    const bill = Math.round((parseFloat(s.bill) || 0) * 100);
    const tip = Math.round((bill * s.tip) / 100);
    const total = bill + tip;
    const per = Math.ceil(total / s.n); // each share rounded up to the next cent
    const extra = per * s.n - total;
    set('[data-out=per]', fmt(bill ? per : 0));
    set('[data-out=bill]', fmt(bill));
    set('[data-out=tip]', fmt(tip));
    set('[data-out=total]', fmt(total));
    set('[data-out=tippct]', s.tip + '%');
    set('[data-out=count]', s.n);
    set('[data-out=people]', s.n === 1 ? '1 person' : s.n + ' people');
    set('[data-out=extra]', extra ? fmt(extra) : '$0.00');
    $$('[data-tip]').forEach((e) => e.classList.toggle('on', +e.dataset.tip === s.tip));
    $$('[data-custom]').forEach((e) => {
      e.classList.toggle('on', !PRESETS.includes(s.tip));
      if (document.activeElement !== e) e.value = PRESETS.includes(s.tip) ? '' : s.tip;
    });
    $$('.empty-only').forEach((e) => (e.hidden = !!bill));
    $$('.result-only').forEach((e) => (e.hidden = !bill));
    $$('[data-step="-1"]').forEach((e) => (e.disabled = s.n <= 1));
  }

  $$('[data-in=bill]').forEach((e) => {
    e.value = s.bill;
    e.addEventListener('input', () => { s.bill = e.value; render(); });
  });
  $$('[data-tip]').forEach((e) =>
    e.addEventListener('click', () => { s.tip = +e.dataset.tip; render(); }));
  $$('[data-custom]').forEach((e) =>
    e.addEventListener('input', () => {
      const v = parseFloat(e.value);
      if (!isNaN(v) && v >= 0 && v <= 100) { s.tip = v; render(); }
    }));
  $$('[data-step]').forEach((e) =>
    e.addEventListener('click', () => {
      s.n = Math.min(99, Math.max(1, s.n + +e.dataset.step));
      render();
    }));
  render();
})();
