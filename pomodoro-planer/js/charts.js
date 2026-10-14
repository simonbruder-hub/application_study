/* Säulendiagramm (gestapelt) in HTML/CSS mit Tooltip – skaliert mit dem Container */
'use strict';

const Charts = (() => {
  const data = {};
  const STEPS = [5, 10, 15, 30, 60, 120, 180, 240, 360, 480, 720, 1440, 2880, 6000, 12000, 30000].map((m) => m * 60);

  const niceStep = (max) => STEPS.find((s) => max / s <= 4) || STEPS[STEPS.length - 1];
  const tickLabel = (sec) => (sec === 0 ? '0' : sec < 3600 ? `${sec / 60} min` : `${+(sec / 3600).toFixed(1)} h`);

  /**
   * buckets: [{label, sub, values: {seriesKey: sec}}]
   * series:  [{key, label, color}]
   */
  function columns({ id, buckets, series, legend = true, labelEvery = 1 }) {
    const totals = buckets.map((b) => U.sum(series, (s) => b.values[s.key] || 0));
    const max = Math.max(0, ...totals);
    const step = niceStep(max || 3600);
    const top = Math.max(step, Math.ceil(max / step) * step);
    data[id] = { buckets, series, totals };
    const ticks = [];
    for (let v = 0; v <= top + 1; v += step) ticks.push(v);
    const grid = ticks.map((v) => `<div class="cg-line${v === 0 ? ' is-base' : ''}" style="bottom:${((v / top) * 100).toFixed(2)}%"><span>${tickLabel(v)}</span></div>`).join('');
    const cols = buckets.map((b, i) => {
      const tot = totals[i];
      const segs = series.filter((s) => (b.values[s.key] || 0) > 0)
        .map((s) => `<i style="flex-grow:${b.values[s.key]};background:${s.color}"></i>`).join('');
      return `<div class="cc" data-chart="${id}" data-i="${i}" tabindex="0" aria-label="${U.esc(b.sub || b.label)}: ${U.fmtDur(tot)}">
        <div class="cc-bar" style="height:${((tot / top) * 100).toFixed(2)}%">${segs}</div></div>`;
    }).join('');
    const xl = buckets.map((b, i) => `<span>${i % labelEvery === 0 ? U.esc(b.label) : ''}</span>`).join('');
    const leg = legend
      ? `<div class="legend">${series.filter((s) => U.sum(buckets, (b) => b.values[s.key] || 0) > 0).map((s) => `<span class="lg"><i style="background:${s.color}"></i>${U.esc(s.label)} <b class="mono">${U.fmtHM(U.sum(buckets, (b) => b.values[s.key] || 0))}</b></span>`).join('')}</div>`
      : '';
    return `${leg}<div class="chart" style="--n:${buckets.length}">
      <div class="chart-plot">${grid}<div class="chart-cols">${cols}</div></div>
      <div class="chart-x">${xl}</div></div>`;
  }

  function tipFor(el) {
    const d = data[el.dataset.chart];
    if (!d) return;
    const i = +el.dataset.i;
    const b = d.buckets[i];
    UI.showTip(el, (tip) => {
      const h = document.createElement('div');
      h.className = 'tip-title';
      h.textContent = b.sub || b.label;
      const tot = document.createElement('div');
      tot.className = 'tip-total';
      tot.textContent = U.fmtDur(d.totals[i]);
      tip.append(h, tot);
      if (d.series.length > 1) {
        d.series.forEach((s) => {
          const v = b.values[s.key] || 0;
          if (!v) return;
          const row = document.createElement('div');
          row.className = 'tip-row';
          const key = document.createElement('i');
          key.style.background = s.color;
          const val = document.createElement('b');
          val.textContent = U.fmtHM(v);
          const lab = document.createElement('span');
          lab.textContent = s.label;
          row.append(key, val, lab);
          tip.append(row);
        });
      }
    });
  }

  const onOver = (e) => { const el = e.target.closest && e.target.closest('.cc'); if (el) tipFor(el); };
  const onOut = (e) => { const el = e.target.closest && e.target.closest('.cc'); if (el) UI.hideTip(); };
  document.addEventListener('pointerover', onOver);
  document.addEventListener('pointerout', onOut);
  document.addEventListener('focusin', onOver);
  document.addEventListener('focusout', onOut);
  window.addEventListener('scroll', () => UI.hideTip(), { passive: true });

  return { columns, data };
})();
