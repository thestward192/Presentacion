// Presentación compartida en vivo: todos los que tengan la presentación
// abierta ven el mismo bloque y el mismo paso de cada animación, y cualquiera
// puede avanzar. Funciona en el sitio estático de Vercel, sin servidor propio:
// los cambios viajan por un servidor público de mensajes (MQTT por WebSocket).
//
// - Estado compartido: { bloque, paso de la animación de ese bloque }. Se
//   publica "retenido", así quien entra tarde salta a donde está el resto.
// - Sala: ?sala=nombre en la dirección (por defecto "principal"). Solo se
//   sincronizan las pantallas que estén en la misma sala.
// - El botón "En vivo" de la barra lo apaga en esta pantalla (se recuerda).

import { buildIn, onBuildStep } from '../components/build';
import type { DeckControl } from './deck';
import { h } from './dom';

const BROKER = 'wss://broker.emqx.io:8084/mqtt';
const BASE = 'novacomp-ta-presentacion-7k2q9x';
const STORAGE_KEY = 'ta-presentacion-envivo';

interface SharedState {
  from: string;
  slide: number;
  step: number;
}

type Status = 'off' | 'connecting' | 'live' | 'error';

// Tipo mínimo del cliente MQTT que se usa aquí (la librería se carga aparte).
interface MqttClient {
  on(event: 'connect' | 'close' | 'offline', cb: () => void): void;
  on(event: 'error', cb: (error: Error) => void): void;
  on(event: 'message', cb: (topic: string, payload: Uint8Array) => void): void;
  subscribe(topic: string | string[]): void;
  publish(topic: string, message: string, options?: { retain?: boolean; qos?: 0 | 1 }): void;
  end(force?: boolean): void;
}

function room(): string {
  const raw = new URLSearchParams(location.search).get('sala') ?? 'principal';
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'principal';
}

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveEnabled(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* sin almacenamiento: solo dura esta visita */
  }
}

export function initLive(deck: DeckControl): void {
  const id = Math.random().toString(36).slice(2, 10);
  const sala = room();
  const stateTopic = `${BASE}/${sala}/estado`;
  const presenceTopic = `${BASE}/${sala}/presentes`;
  const myPresence = `${presenceTopic}/${id}`;
  const present = new Set<string>();

  let client: MqttClient | null = null;
  let status: Status = 'off';
  let enabled = readEnabled();
  // Mientras se aplica un cambio que vino de otro, no se vuelve a publicar.
  let applying = false;

  // -- Botón en la barra ------------------------------------------------------
  const label = h('span.live-label', {}, 'En vivo');
  const button = h('button.live-toggle', { type: 'button', 'aria-pressed': 'false' }, h('span.live-dot', { 'aria-hidden': 'true' }), label);
  document.querySelector('.nav-actions')?.prepend(button);
  button.addEventListener('click', () => {
    enabled = !enabled;
    saveEnabled(enabled);
    if (enabled) void connect();
    else disconnect();
  });

  function render(next: Status = status): void {
    status = next;
    button.dataset.status = status;
    button.setAttribute('aria-pressed', String(enabled));
    const others = Math.max(0, present.size - 1);
    label.textContent =
      status === 'live'
        ? `En vivo${present.size ? ` · ${present.size}` : ''}`
        : status === 'connecting'
          ? 'Conectando…'
          : status === 'error'
            ? 'Sin conexión'
            : 'Solo esta pantalla';
    button.title =
      status === 'live'
        ? `Sala "${sala}": ${others === 0 ? 'nadie más conectado todavía' : `${others} ${others === 1 ? 'pantalla más' : 'pantallas más'}`}. Cualquiera puede avanzar. Toca para desconectar esta pantalla.`
        : status === 'off'
          ? 'Toca para volver a seguir la presentación en vivo.'
          : `Sala "${sala}"`;
  }

  // -- Publicar lo que se hace en esta pantalla ---------------------------------
  function publish(): void {
    if (!client || status !== 'live' || applying) return;
    const slide = deck.current();
    const el = deck.slideAt(slide);
    const state: SharedState = { from: id, slide, step: (el && buildIn(el)?.step()) ?? 0 };
    client.publish(stateTopic, JSON.stringify(state), { retain: true, qos: 1 });
  }

  deck.onNavigate(() => publish());
  onBuildStep((root) => {
    // Solo cuenta la animación del bloque que se está mostrando.
    const el = deck.slideAt(deck.current());
    if (el?.contains(root)) publish();
  });

  // -- Aplicar lo que hace otro presentador -------------------------------------
  function apply(state: SharedState): void {
    if (state.from === id || !Number.isInteger(state.slide) || !deck.slideAt(state.slide)) return;
    applying = true;
    try {
      if (state.slide !== deck.current()) deck.show(state.slide);
      const build = buildIn(deck.slideAt(state.slide)!);
      if (build && build.step() !== state.step) build.set(state.step);
    } finally {
      applying = false;
    }
  }

  // -- Conexión -------------------------------------------------------------------
  async function connect(): Promise<void> {
    if (client) return;
    render('connecting');
    try {
      const mod = (await import('mqtt')) as unknown as { connect?: Function; default?: { connect: Function } };
      const connectFn = (mod.connect ?? mod.default!.connect) as (url: string, options: object) => MqttClient;
      if (!enabled || client) return;
      const c = connectFn(BROKER, {
        clientId: `ta-${id}`,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 3000,
        // Si la pantalla se cierra de golpe, el servidor la saca de la lista.
        will: { topic: myPresence, payload: '', retain: true, qos: 1 },
      });
      client = c;
      c.on('connect', () => {
        c.subscribe([stateTopic, `${presenceTopic}/+`]);
        c.publish(myPresence, '1', { retain: true, qos: 1 });
        present.add(id);
        render('live');
      });
      c.on('message', (topic, payload) => {
        const text = new TextDecoder().decode(payload);
        if (topic === stateTopic) {
          try {
            apply(JSON.parse(text) as SharedState);
          } catch {
            /* mensaje ajeno o dañado: se ignora */
          }
        } else if (topic.startsWith(`${presenceTopic}/`)) {
          const who = topic.slice(presenceTopic.length + 1);
          if (text) present.add(who);
          else present.delete(who);
          render();
        }
      });
      c.on('offline', () => render('connecting'));
      c.on('error', () => render('error'));
    } catch {
      client = null;
      render('error');
    }
  }

  function disconnect(): void {
    if (client) {
      client.publish(myPresence, '', { retain: true, qos: 1 });
      client.end();
      client = null;
    }
    present.clear();
    render('off');
  }

  addEventListener('pagehide', () => {
    if (client) {
      client.publish(myPresence, '', { retain: true });
      client.end(true);
    }
  });

  render(enabled ? 'connecting' : 'off');
  if (enabled) void connect();
}
