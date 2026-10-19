// Resaltador de Python mínimo (sin dependencias). Devuelve HTML por línea y
// mantiene el estado de los docstrings de varias líneas.

import { escapeHtml } from './dom';

const KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield',
]);
const CONSTANTS = new Set(['None', 'True', 'False', 'self']);

const TOKEN = new RegExp(
  [
    String.raw`(?<comment>#.*$)`,
    String.raw`(?<string>[rbfRBF]{0,2}("""|'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))`,
    String.raw`(?<decorator>@[\w.]+)`,
    String.raw`(?<number>\b\d+(?:\.\d+)?\b)`,
    String.raw`(?<word>\b[A-Za-z_]\w*\b)`,
  ].join('|'),
  'g',
);

function span(kind: string, text: string): string {
  return `<span class="tok-${kind}">${escapeHtml(text)}</span>`;
}

export function highlightPython(lines: string[]): string[] {
  let openTriple: string | null = null;
  return lines.map((line) => {
    let html = '';
    let rest = line;

    if (openTriple) {
      const end = rest.indexOf(openTriple);
      if (end === -1) return span('string', rest);
      html += span('string', rest.slice(0, end + 3));
      rest = rest.slice(end + 3);
      openTriple = null;
    }

    let last = 0;
    let previousWord = '';
    TOKEN.lastIndex = 0;
    for (let match = TOKEN.exec(rest); match; match = TOKEN.exec(rest)) {
      html += escapeHtml(rest.slice(last, match.index));
      const groups = match.groups!;
      const text = match[0];
      if (groups.comment) {
        html += span('comment', text);
      } else if (groups.string) {
        const triple = groups.string.match(/("""|''')$/)?.[1];
        const prefixLength = text.length - groups.string.length;
        const opener = text.slice(prefixLength);
        if (triple && (opener === '"""' || opener === "'''")) {
          // Docstring: busca el cierre en la misma línea; si no, sigue abierto.
          const close = rest.indexOf(opener, match.index + text.length);
          if (close === -1) {
            html += span('string', rest.slice(match.index));
            openTriple = opener;
            last = rest.length;
            break;
          }
          html += span('string', rest.slice(match.index, close + 3));
          TOKEN.lastIndex = close + 3;
          last = close + 3;
          continue;
        }
        html += span('string', text);
      } else if (groups.decorator) {
        html += span('decorator', text);
      } else if (groups.number) {
        html += span('number', text);
      } else if (groups.word) {
        if (previousWord === 'def' || previousWord === 'class') html += span('function', text);
        else if (CONSTANTS.has(text)) html += span('number', text);
        else if (KEYWORDS.has(text)) html += span('keyword', text);
        else html += escapeHtml(text);
        previousWord = text;
      }
      last = match.index + text.length;
    }
    html += escapeHtml(rest.slice(last));
    return html || ' ';
  });
}
