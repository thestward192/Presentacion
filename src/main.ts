import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/demos.css';
import './styles/deck.css';
import './styles/intro.css';
import './styles/extras.css';
import './styles/anim.css';
import './styles/how.css';

import { initCursor } from './components/cursor';
import { heroSlide } from './components/layout';
import { createDeck } from './core/deck';
import { h } from './core/dom';
import { setCandidateNames } from './core/names';
import { initTheme } from './core/theme';
import { findEvent, loadTraces } from './core/trace-loader';
import { readXlsx } from './core/xlsx';
import { thanks } from './sections/closing';
import { excelUrl } from './sections/excel';
import {
  howConversation,
  howCv,
  howEvaluate,
  howExcel,
  howInconsistencies,
  howJd,
  howJev,
  howReport,
} from './sections/how';
import { cover, problem } from './sections/intro';
import { teamwork } from './sections/team';

async function start(): Promise<void> {
  initTheme(document.querySelector<HTMLButtonElement>('.theme-toggle')!);
  initCursor();
  const main = document.querySelector<HTMLElement>('main')!;

  try {
    const traces = await loadTraces();
    const { fileName, url } = excelUrl(traces);
    const { sheets } = await readXlsx(url);
    const excel = { sheets, fileName, url };
    setCandidateNames(findEvent(traces.cv, (e) => e.args.vacancy_id === traces.index.vacancy, 'CVs de la vacante').result!.result);

    // Presentación corta: cómo es el proyecto, cómo lo trabajamos y una
    // animación demostrativa por herramienta.
    createDeck(main, [
      {
        id: 'introduccion',
        title: 'El proyecto',
        slides: [cover(traces), problem(traces)],
      },
      {
        id: 'equipo',
        title: 'Cómo lo trabajamos',
        slides: [teamwork()],
      },
      {
        id: 'oscar',
        title: 'Oscar',
        slides: [
          heroSlide({
            id: 'oscar-portada',
            number: '01',
            name: 'Oscar Zúñiga Sánchez',
            role: 'Entender la vacante y los CVs',
            tasks: ['Leer la vacante', 'Leer los CVs', 'Cómo califica Jev'],
            techTasks: [],
          }),
          howJd(traces),
          howCv(traces),
          howJev(traces),
        ],
      },
      {
        id: 'randall',
        title: 'Randall',
        slides: [
          heroSlide({
            id: 'randall-portada',
            number: '02',
            name: 'Randall Carranza Solano',
            role: 'Calificar y verificar',
            tasks: ['Calificar cada CV', 'Revisar datos que no cuadran'],
            techTasks: [],
          }),
          howEvaluate(traces),
          howInconsistencies(traces),
        ],
      },
      {
        id: 'stward',
        title: 'Stward',
        slides: [
          heroSlide({
            id: 'stward-portada',
            number: '03',
            name: 'Stward Serrano Sánchez',
            role: 'Recomendar y conversar',
            tasks: ['Informe con recomendación', 'Conversación con el candidato'],
            techTasks: [],
          }),
          howReport(traces),
          howConversation(traces),
        ],
      },
      {
        id: 'cierre',
        title: 'Cierre',
        slides: [howExcel(traces, excel), thanks(traces)],
      },
    ]);
  } catch (error) {
    console.error(error);
    main.replaceChildren(
      h(
        'div.load-error',
        { role: 'alert' },
        h('h2', {}, 'No se pudieron cargar las trazas'),
        h('p', {}, String((error as Error).message ?? error)),
        h('p.muted', {}, 'Abre la app con npm run dev o npm run preview (o cualquier servidor estático): el navegador no permite leer archivos locales con fetch.'),
      ),
    );
  }
}

void start();
