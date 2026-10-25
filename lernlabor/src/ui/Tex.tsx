/** Formeln mit KaTeX */
import katex from 'katex';
import { useMemo } from 'preact/hooks';

export function Tex({ children, block }: { children: string; block?: boolean }) {
  const html = useMemo(() => katex.renderToString(children, { displayMode: !!block, throwOnError: false, output: 'html', strict: false }), [children, block]);
  return <span class={block ? 'tex tex-block' : 'tex'} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Text mit eingebetteten Formeln: $…$ wird gesetzt */
export function TexText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return <>{parts.map((p, i) => (p.startsWith('$') && p.endsWith('$') && p.length > 2 ? <Tex key={i}>{p.slice(1, -1)}</Tex> : p))}</>;
}
