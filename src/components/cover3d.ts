// Escena 3D de la portada (three.js): un anillo de 20 tarjetas de CV que gira
// despacio alrededor de un núcleo. Cada tanto el núcleo "lee" una tarjeta:
// la tarjeta se ilumina y una línea la une al centro. Sobria a propósito.
//
// Se carga aparte (import dinámico) y solo se anima mientras la portada está
// en pantalla. Con prefers-reduced-motion se dibuja un único cuadro quieto.

import { h } from '../core/dom';
import { prefersReducedMotion } from '../core/motion';

const CARDS = 20;

function cssColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function mountCover3D(slideEl: HTMLElement): void {
  const host = h('div.cover-3d', { 'aria-hidden': 'true' });
  slideEl.prepend(host);

  void import('three').then((THREE) => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.6, 11);

    const world = new THREE.Group();
    scene.add(world);

    // -- Materiales (colores del tema) -------------------------------------
    const accent = new THREE.Color();
    const ink = new THREE.Color();
    const cardFill = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false });
    const cardEdge = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.32 });
    const lineMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.12, depthWrite: false });
    const coreMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.38 });
    const glowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.12, depthWrite: false });
    const dustMat = new THREE.PointsMaterial({ size: 0.028, transparent: true, opacity: 0.4, depthWrite: false });
    const beamMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0 });

    function applyTheme(): void {
      accent.set(cssColor('--accent', '#4f46e5'));
      ink.set(cssColor('--text', '#1c1917'));
      cardFill.color.copy(accent);
      cardEdge.color.copy(accent);
      lineMat.color.copy(ink);
      coreMat.color.copy(accent);
      glowMat.color.copy(accent);
      dustMat.color.copy(accent);
      beamMat.color.copy(accent);
      render();
    }

    // -- Anillo de tarjetas de CV ------------------------------------------
    const ring = new THREE.Group();
    ring.rotation.set(0.42, 0, -0.12);
    world.add(ring);
    const radius = 3.3;
    const cardGeo = new THREE.PlaneGeometry(0.78, 1.04);
    const cardEdges = new THREE.EdgesGeometry(cardGeo);
    const cards: { group: InstanceType<typeof THREE.Group>; fill: InstanceType<typeof THREE.MeshBasicMaterial>; phase: number }[] = [];

    for (let i = 0; i < CARDS; i += 1) {
      const angle = (i / CARDS) * Math.PI * 2;
      const card = new THREE.Group();
      const fill = cardFill.clone();
      card.add(new THREE.Mesh(cardGeo, fill));
      card.add(new THREE.LineSegments(cardEdges, cardEdge));
      // "Foto" y renglones de texto del CV.
      const avatar = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), lineMat);
      avatar.position.set(-0.23, 0.33, 0.001);
      card.add(avatar);
      [0.42, 0.3, 0.36, 0.24, 0.4].forEach((width, row) => {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.035), lineMat);
        bar.position.set(-0.32 + width / 2, 0.12 - row * 0.12, 0.001);
        card.add(bar);
      });
      card.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      card.lookAt(0, 0, 0);
      card.rotateY(Math.PI);
      ring.add(card);
      cards.push({ group: card, fill, phase: i * 0.7 });
    }

    // -- Núcleo -------------------------------------------------------------
    const core = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.8, 1)), coreMat);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 32), glowMat);
    world.add(core, glow);

    // -- Polvo de fondo -------------------------------------------------------
    const dustCount = 240;
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i += 1) {
      const r = 4.5 + Math.random() * 3;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      positions.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p) * 0.6, r * Math.sin(p) * Math.sin(t)], i * 3);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    world.add(new THREE.Points(dustGeo, dustMat));

    // -- Haz que une el núcleo con la tarjeta que se está "leyendo" ----------
    const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const beam = new THREE.Line(beamGeo, beamMat);
    world.add(beam);

    // Mundo desplazado a la derecha para dejar el texto libre a la izquierda.
    function layout(): void {
      const { clientWidth: w, clientHeight: hgt } = host;
      if (!w || !hgt) return;
      renderer.setSize(w, hgt, false);
      camera.aspect = w / hgt;
      camera.updateProjectionMatrix();
      const wide = w > 1100;
      world.position.x = wide ? 3.55 : 0;
      world.position.y = wide ? 0.15 : 0;
      world.scale.setScalar(wide ? 0.74 : 0.8);
      host.classList.toggle('is-behind', !wide);
      render();
    }

    let pointerX = 0;
    let pointerY = 0;
    addEventListener('pointermove', (event) => {
      pointerX = event.clientX / innerWidth - 0.5;
      pointerY = event.clientY / innerHeight - 0.5;
    }, { passive: true });

    const target = new THREE.Vector3();
    const clock = new THREE.Clock();
    let running = false;
    let frame = 0;

    function render(): void {
      renderer.render(scene, camera);
    }

    function tick(): void {
      if (!running) return;
      const t = clock.getElapsedTime();
      ring.rotation.y = t * 0.08;
      core.rotation.set(t * 0.15, t * 0.22, 0);
      glow.scale.setScalar(1 + Math.sin(t * 1.4) * 0.05);
      world.rotation.y += (pointerX * 0.25 - world.rotation.y) * 0.04;
      world.rotation.x += (pointerY * 0.12 - world.rotation.x) * 0.04;

      // Cada 1,8 s se "lee" una tarjeta distinta.
      const reading = Math.floor(t / 1.8) % CARDS;
      const local = (t % 1.8) / 1.8;
      const pulse = Math.sin(local * Math.PI);
      cards.forEach((card, i) => {
        const on = i === reading ? pulse : 0;
        card.fill.opacity = 0.05 + on * 0.22;
        card.group.position.y = Math.sin(t * 0.8 + card.phase) * 0.08;
      });
      cards[reading].group.getWorldPosition(target);
      world.worldToLocal(target);
      const points = beamGeo.attributes.position as InstanceType<typeof THREE.BufferAttribute>;
      points.setXYZ(1, target.x, target.y, target.z);
      points.needsUpdate = true;
      beamMat.opacity = pulse * 0.5;

      render();
      frame = requestAnimationFrame(tick);
    }

    function start(): void {
      if (running || prefersReducedMotion()) return render();
      running = true;
      clock.start();
      frame = requestAnimationFrame(tick);
    }
    function stop(): void {
      running = false;
      cancelAnimationFrame(frame);
    }

    new ResizeObserver(layout).observe(host);
    slideEl.addEventListener('slide:enter', start);
    slideEl.addEventListener('slide:leave', stop);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : slideEl.classList.contains('is-active') && start()));
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

    applyTheme();
    layout();
    if (slideEl.classList.contains('is-active')) start();
    host.classList.add('is-ready');
  });
}
