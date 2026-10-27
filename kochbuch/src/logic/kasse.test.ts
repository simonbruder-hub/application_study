import { planeKasse } from './kasse';

let n = 0;
const id = () => `id-${++n}`;

describe('Übergabe an Kasse unterwegs', () => {
  it('setzt neue Artikel auf die Liste und lässt offene doppelte weg', () => {
    const plan = planeKasse(
      [{ name: 'Zwiebel', text: 'Zwiebel (2)' }, { name: 'Rahm', text: 'Rahm (1 dl)' }, { name: 'Milch', text: 'Milch (2 dl)' }],
      {
        stand: { liste: [{ id: 's1', text: 'Zwiebeln rot' }, { id: 's2', text: 'Milch', erledigt: true }] },
        listeNeu: [{ pwaId: 'n1', text: 'Rahm', quelle: 'Handy' }],
        listeStatus: {},
      },
      id,
    );
    expect(plan.schon).toEqual(['Zwiebel', 'Rahm']);
    expect(plan.neu).toEqual([{ pwaId: 'id-1', text: 'Milch (2 dl)', quelle: 'Kochbuch' }]);
  });

  it('beachtet Häkchen, die nur auf dem Handy gesetzt sind', () => {
    const plan = planeKasse(
      [{ name: 'Rahm', text: 'Rahm (1 dl)' }, { name: 'Butter', text: 'Butter' }],
      { stand: { liste: [{ id: 's1', text: 'Butter' }] }, listeNeu: [{ pwaId: 'n1', text: 'Rahm' }], listeStatus: { n1: true, s1: true } },
      id,
    );
    expect(plan.schon).toEqual([]);
    expect(plan.neu.map(x => x.text)).toEqual(['Rahm (1 dl)', 'Butter']);
  });

  it('kommt mit einer leeren oder neuen Kasse zurecht', () => {
    const plan = planeKasse([{ name: 'Salz', text: 'Salz' }, { name: 'Salz', text: 'Salz' }], {}, id);
    expect(plan.neu).toHaveLength(1);
    expect(plan.schon).toEqual(['Salz']);
  });
});
