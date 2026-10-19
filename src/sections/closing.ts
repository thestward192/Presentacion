import { section, slide } from '../components/layout';
import { TEAM } from './intro';
import { h } from '../core/dom';
import { formatRecordedAt } from '../core/trace-loader';
import type { Traces } from '../core/types';

export function quality(): HTMLElement {
  const rows = [
    { kind: 'Cada regla por separado', tech: 'Pruebas unitarias', text: 'Se prueba que cada regla (sumar años, calificar, recomendar) dé el resultado esperado.' },
    { kind: 'Las herramientas, como las usa el asistente', tech: 'Contrato MCP', text: 'Se llama a cada herramienta igual que lo haría el asistente y se revisa qué devuelve.' },
    { kind: 'La estructura del sistema', tech: 'Arquitectura', text: 'Se verifica que las reglas del centro no dependan de piezas de afuera, para poder cambiarlas sin romper nada.' },
  ];
  return section(
    {
      id: 'calidad',
      chapter: 'Calidad',
      kicker: 'Calidad',
      title: 'Cómo se comprueba que funciona',
      lead: 'Tres tipos de prueba, cada una mira una parte distinta.',
    },
    h('ul.quality', { 'data-reveal': '' }, ...rows.map((row) => h('li', {}, h('span.q-kind', {}, row.kind, h('span.q-tech.tech-only', {}, row.tech)), h('p', {}, row.text)))),
  );
}

export function nextSteps(): HTMLElement {
  const items = [
    { title: 'Experiencia por tecnología', text: 'Hoy se compara la experiencia total; el siguiente paso es contar años por tecnología.' },
    {
      title: 'Fecha actual en los CVs de prueba',
      text: 'Varios CVs de prueba se escribieron en 2024. Como "hasta la actualidad" suma años hasta hoy, aparecen avisos de experiencia que no cuadra.',
    },
    { title: 'Variación de Jev', text: 'Jev es un modelo de IA: su nota puede variar un poco entre una ejecución y otra. La decisión final sigue siendo de una persona.' },
    { title: 'Archivos no procesables', text: `Algunos archivos de prueba no son PDF reales y salen como "no procesable": hay que pedirlos de nuevo.` },
  ];
  return section(
    {
      id: 'limites',
      chapter: 'Límites',
      kicker: 'Próximos pasos y límites',
      title: 'Lo que sigue',
      lead: 'Lo que hoy tiene límites conocidos y lo que viene después.',
    },
    h('ol.next-list', { 'data-reveal': '' }, ...items.map((item, i) => h('li', { style: `--i:${i}` }, h('h3', {}, item.title), h('p', {}, item.text)))),
  );
}

export function thanks(traces: Traces): HTMLElement {
  return slide(
    { id: 'gracias', title: 'Gracias', className: 'slide-thanks' },
    h('p.kicker', { 'data-reveal': '' }, 'Talent Acquisition · Pre-Screening con MCP'),
    h('h2.thanks-title', { 'data-reveal': '' }, 'Gracias'),
    h('p.thanks-sub', { 'data-reveal': '' }, '¿Preguntas?'),
    h('ul.thanks-team', { 'data-reveal': '' }, ...TEAM.map((member) => h('li', {}, member.name))),
    h(
      'footer.footer',
      { 'data-reveal': '' },
      h('p', {}, `Demos: ejecuciones reales grabadas el ${formatRecordedAt(traces.index.recorded_at)}, sobre CVs de prueba.`),
      h('p.tech-only', {}, `Código: módulo talent_acquisition (extractos leídos directamente de los archivos fuente). Vacante con archivos dañados: ${traces.index.broken_vacancy}.`),
      h('p', {}, 'Correos y teléfonos ocultos. Las respuestas del candidato son de ejemplo.'),
    ),
  );
}
