/** Werte: Kennwerte der Schaltung, Augenblickswerte, Zeigergrössen und Gleichstrom-Endwerte aller Bauteile */
import { isTwoTerminal } from '../sim/circuit';
import { perSecond, si } from '../sim/units';
import { engine, live, version } from './engine';
import { selected } from './state';

const DAMPING: Record<string, string> = {
  aperiodisch: 'aperiodisch (Kriechfall)',
  grenzfall: 'aperiodischer Grenzfall',
  schwingfall: 'gedämpfte Schwingung',
  ungedaempft: 'ungedämpfte Schwingung',
};

export function Kennwerte() {
  version.value;
  const m = engine.modes;
  const rows: [string, string, string?][] = [];
  if (m.order === 0) rows.push(['Ordnung', '0', 'keine Energiespeicher: Strom und Spannung folgen sofort']);
  else if (m.order > 2) rows.push(['Ordnung', String(m.order), 'Kennwerte werden für 1. und 2. Ordnung angezeigt']);
  else rows.push(['Ordnung', String(m.order), m.order === 1 ? 'ein Energiespeicher' : 'zwei Energiespeicher']);
  if (m.tau !== undefined) {
    rows.push(['τ', Number.isFinite(m.tau) ? si(m.tau, 's') : '∞', 'τ = R·C bzw. L/R mit dem Ersatzwiderstand am Speicher']);
    if (Number.isFinite(m.tau)) {
      rows.push(['5 τ', si(5 * m.tau, 's'), 'Vorgang praktisch abgeschlossen (99.3 %)']);
      rows.push(['f_g', si(m.fg!, 'Hz'), 'f_g = 1 / (2π·τ)']);
    }
  }
  if (m.f0 !== undefined) {
    rows.push(['f₀', si(m.f0, 'Hz'), 'Kennfrequenz ω₀ = 1/√(LC) bei Reihen- und Parallelkreis']);
    rows.push(['δ', perSecond(m.delta!), 'Abklingkonstante (Reihenkreis δ = R/(2L))']);
    if (m.fd) rows.push(['f_d', si(m.fd, 'Hz'), 'Frequenz der gedämpften Schwingung, ω_d = √(ω₀² − δ²)']);
    if (m.Q !== undefined) rows.push(['Güte Q', Number.isFinite(m.Q) && m.Q < 1e6 ? m.Q.toPrecision(3) : '∞', 'Q = ω₀ / (2δ)']);
    if (m.taus && m.damping !== 'schwingfall') rows.push(['τ₁, τ₂', `${si(m.taus[0], 's')} · ${si(m.taus[1], 's')}`]);
    rows.push(['Fall', DAMPING[m.damping!] ?? '']);
  }
  return (
    <dl class="kenn">
      {rows.map(([k, v, note]) => (
        <div key={k}><dt>{k}</dt><dd><b>{v}</b>{note && <small>{note}</small>}</dd></div>
      ))}
    </dl>
  );
}

const deg = (re: number, im: number) => `${((Math.atan2(im, re) * 180) / Math.PI).toFixed(1)}°`;

export function Values() {
  live.value;
  const net = engine.net;
  const s = engine.sim.last;
  const ac = engine.ac;
  const dc = engine.dc;
  const rows = net.elems.map((e, k) => ({ e, k })).filter(({ e }) => isTwoTerminal(e.part.kind) || e.part.kind === 'S2');
  const sel = selected.value;
  return (
    <div class="values">
      <section>
        <h3>Kennwerte</h3>
        <Kennwerte />
      </section>
      {engine.sim.error && <p class="panel-note is-bad">{engine.sim.error}</p>}
      <section>
        <h3>Augenblickswerte bei t = {si(engine.sim.t, 's', 3)}</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Bauteil</th><th>u</th><th>i</th><th>p</th></tr></thead>
            <tbody>
              {rows.map(({ e, k }) => {
                const src = e.part.kind === 'V' || e.part.kind === 'I';
                const u = s.uRe[k]!, i = (src ? -1 : 1) * s.iRe[k]!;
                return (
                  <tr key={e.part.id} class={e.part.id === sel ? 'is-sel' : ''} onClick={() => (selected.value = e.part.id)}>
                    <th>{e.part.name}{src && <small> (abgegeben)</small>}</th>
                    <td>{si(u, 'V')}</td><td>{si(i, 'A')}</td><td>{si(u * i, 'W')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {ac?.ok && engine.acF && (
        <section>
          <h3>Wechselstrom bei f = {si(engine.acF, 'Hz')} (Effektivwerte)</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Bauteil</th><th>U</th><th>φ_u</th><th>I</th><th>φ_i</th><th>Z</th><th>φ_Z</th><th>P</th><th>Q</th><th>S</th></tr></thead>
              <tbody>
                {rows.map(({ e, k }) => {
                  const src = e.part.kind === 'V' || e.part.kind === 'I';
                  const ur = ac.uRe[k]!, ui = ac.uIm[k]!;
                  const sg = src ? -1 : 1;
                  const ir = sg * ac.iRe[k]!, ii = sg * ac.iIm[k]!;
                  const U = Math.hypot(ur, ui) / Math.SQRT2, I = Math.hypot(ir, ii) / Math.SQRT2;
                  // S = U · I* mit Effektivwerten
                  const P = (ur * ir + ui * ii) / 2, Q = (ui * ir - ur * ii) / 2;
                  const Z = I > 1e-15 ? U / I : Infinity;
                  const phiZ = Math.atan2(ui, ur) - Math.atan2(ii, ir);
                  return (
                    <tr key={e.part.id} class={e.part.id === sel ? 'is-sel' : ''} onClick={() => (selected.value = e.part.id)}>
                      <th>{e.part.name}</th>
                      <td>{si(U, 'V')}</td><td>{deg(ur, ui)}</td>
                      <td>{si(I, 'A')}</td><td>{I > 1e-15 ? deg(ir, ii) : '–'}</td>
                      <td>{Number.isFinite(Z) && !src ? si(Z, 'Ω') : '–'}</td>
                      <td>{I > 1e-15 && !src ? `${(((phiZ * 180) / Math.PI + 540) % 360 - 180).toFixed(1)}°` : '–'}</td>
                      <td>{si(P, 'W')}</td><td>{si(Q, 'var')}</td><td>{si(U * I, 'VA')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p class="small muted">Quellen: abgegebene Leistung. Q &gt; 0 induktiv, Q &lt; 0 kapazitiv. Phasen mit Sinus als Bezug.</p>
        </section>
      )}
      {dc?.ok && (
        <section>
          <h3>Gleichstrom: Endwerte (eingeschwungen)</h3>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Bauteil</th><th>U</th><th>I</th><th>P</th></tr></thead>
              <tbody>
                {rows.map(({ e, k }) => {
                  const src = e.part.kind === 'V' || e.part.kind === 'I';
                  const u = dc.uRe[k]!, i = (src ? -1 : 1) * dc.iRe[k]!;
                  return <tr key={e.part.id}><th>{e.part.name}</th><td>{si(u, 'V')}</td><td>{si(i, 'A')}</td><td>{si(u * i, 'W')}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
