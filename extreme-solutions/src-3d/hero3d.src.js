// Escena 3D de la portada de Extreme Solutions.
// Núcleo de vidrio iridiscente (IA) rodeado de nodos-cubo conectados (apps, webs, datos),
// iluminado con los colores de la marca. Se empaqueta con esbuild en ../hero3d.js.
import {
  AdditiveBlending, AmbientLight, BackSide, BoxGeometry, BufferAttribute, BufferGeometry,
  CanvasTexture, Color, Group, IcosahedronGeometry, InstancedMesh, LineBasicMaterial, LineSegments, MathUtils, Mesh,
  MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry,
  NeutralToneMapping, PMREMGenerator, PointLight, Points, PointsMaterial, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3,
  WebGLRenderer
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const BRAND = { blue: 0x2563eb, sky: 0x60a5fa, cyan: 0x22d3ee, teal: 0x0e9bb8, green: 0x10b981, amber: 0xf59e0b };
const damp = (current, target, lambda, dt) => MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));

function rendererInfo(gl) {
  let name = '';
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { /* opcional */ }
  return String(name || '');
}

const isSoftware = gl => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rendererInfo(gl));

// Calidad según dispositivo: móviles, poca memoria o GPU por software → calidad baja.
function pickTier(software) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 768;
  const lowMemory = (navigator.deviceMemory || 8) <= 4;
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4;
  if (software || coarse || small || lowMemory) return 'low';
  return fewCores ? 'mid' : 'high';
}
const PIXEL_RATIO = { high: 2, mid: 1.5, low: 1.25 };

// Mapa de entorno propio (paneles de luz con colores de marca) para reflejos y refracción.
function brandEnvironment(renderer) {
  const env = new Scene();
  const disposables = [];
  const add = mesh => { env.add(mesh); disposables.push(mesh.geometry, mesh.material); return mesh; };
  add(new Mesh(new SphereGeometry(12, 32, 16), new MeshBasicMaterial({ color: 0x03050a, side: BackSide })));
  const panel = (color, intensity, position, size) => {
    const mesh = add(new Mesh(new PlaneGeometry(size[0], size[1]), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity) })));
    mesh.position.set(...position);
    mesh.lookAt(0, 0, 0);
  };
  panel(0xffffff, 3.2, [0, 7, 3], [7, 1.2]);
  panel(0xffffff, 2.2, [-3, -2, 7], [0.6, 5]);
  panel(BRAND.blue, 5, [-8, 1, 2], [3, 9]);
  panel(BRAND.cyan, 3.2, [8, -1, 3], [3, 8]);
  panel(BRAND.green, 1.4, [0, -7, -3], [9, 2]);
  panel(0xffffff, 1.2, [3, 2, 8], [2, 2]);
  const pmrem = new PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  disposables.forEach(item => item.dispose());
  return texture;
}

function blobGeometry(detail) {
  let geometry = new IcosahedronGeometry(1.25, detail);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();
    const r = 1.25 * (1
      + 0.11 * Math.sin(3.1 * v.x + 1.3) * Math.sin(2.7 * v.y + 0.4) * Math.sin(3.3 * v.z + 0.7)
      + 0.05 * Math.sin(6.0 * v.y + 2.0 * v.x));
    position.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function spotlightTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#04060b';
  ctx.fillRect(0, 0, size, size);
  const glow = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(4,6,11,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  };
  glow(256, 250, 250, 'rgba(37,99,235,.55)');
  glow(360, 360, 150, 'rgba(34,211,238,.28)');
  glow(170, 150, 140, 'rgba(96,165,250,.18)');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function glassMaterial(tier, envMap) {
  const common = { envMap, envMapIntensity: 1.6, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.9, iridescenceIOR: 1.3, iridescenceThicknessRange: [160, 560], specularIntensity: 1 };
  if (tier === 'low') {
    // Sin transmisión (pase de render extra): vidrio oscuro translúcido iridiscente.
    return new MeshPhysicalMaterial({ ...common, color: 0x1c3f86, transparent: true, opacity: 0.86, roughness: 0.12, sheen: 0.6, sheenColor: new Color(BRAND.cyan) });
  }
  return new MeshPhysicalMaterial({ ...common, color: 0xffffff, transmission: 1, thickness: 1.1, ior: 1.38, dispersion: tier === 'high' ? 0.4 : 0, attenuationColor: new Color(0x8bb5ff), attenuationDistance: 5 });
}

function buildScene(renderer, tier) {
  const scene = new Scene();
  const envMap = brandEnvironment(renderer);
  scene.environment = envMap;
  const disposables = [envMap];
  const keep = (...items) => { disposables.push(...items); return items[0]; };

  const root = new Group();
  scene.add(root);

  // Fondo con foco de color (el vidrio lo refracta); sus bordes coinciden con el negro de la página.
  scene.background = keep(spotlightTexture());

  // Núcleo de vidrio con un corazón luminoso (la "IA").
  const core = new Group();
  root.add(core);
  const blob = new Mesh(keep(blobGeometry(tier === 'low' ? 18 : 36)), keep(glassMaterial(tier, envMap)));
  core.add(blob);
  const heart = new Mesh(keep(new IcosahedronGeometry(0.26, 4)), keep(new MeshBasicMaterial({ color: new Color(BRAND.cyan).multiplyScalar(2.2) })));
  core.add(heart);
  const heartLight = new PointLight(BRAND.cyan, 6, 6, 2);
  core.add(heartLight);

  // Órbitas finas.
  const ringMaterial = keep(new MeshBasicMaterial({ color: BRAND.sky, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false }));
  const rings = [[2.05, 0.011, 1.3, 0.35], [2.45, 0.006, 1.75, -0.4]].map(([radius, tube, rx, ry]) => {
    const ring = new Mesh(keep(new TorusGeometry(radius, tube, 8, 160)), ringMaterial);
    ring.rotation.set(rx, ry, 0);
    root.add(ring);
    return ring;
  });

  // Nodos-cubo en una esfera de Fibonacci, conectados con sus vecinos más cercanos.
  const count = tier === 'low' ? 20 : 28;
  const nodes = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const dist = 2.6 + ((i * 37) % 11) / 11 * 0.55;
    nodes.push({ base: new Vector3(Math.cos(theta) * radius, y * 0.82, Math.sin(theta) * radius).multiplyScalar(dist), phase: i * 1.7, speed: 0.4 + ((i * 13) % 7) / 10, size: 0.1 + ((i * 29) % 9) / 9 * 0.09, current: new Vector3() });
  }
  const palette = [BRAND.blue, BRAND.cyan, BRAND.sky, BRAND.blue, BRAND.green, BRAND.cyan, BRAND.amber];
  const cubeMaterial = keep(new MeshStandardMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.22, envMap, envMapIntensity: 1.1, emissive: new Color(0x0b1b3a), emissiveIntensity: 0.6 }));
  const cubes = new InstancedMesh(keep(new BoxGeometry(1, 1, 1)), cubeMaterial, count);
  nodes.forEach((node, i) => cubes.setColorAt(i, new Color(palette[i % palette.length])));
  root.add(cubes);

  const pairs = [];
  nodes.forEach((a, i) => {
    nodes.map((b, j) => [j, a.base.distanceTo(b.base)]).filter(([j]) => j > i).sort((x, y) => x[1] - y[1]).slice(0, 2)
      .forEach(([j, d]) => { if (d < 2.2) pairs.push([i, j]); });
  });
  const hubs = [];
  const linePositions = new Float32Array((pairs.length + hubs.length) * 6);
  const lineGeometry = keep(new BufferGeometry());
  lineGeometry.setAttribute('position', new BufferAttribute(linePositions, 3));
  const lines = new LineSegments(lineGeometry, keep(new LineBasicMaterial({ color: BRAND.sky, transparent: true, opacity: 0.26, blending: AdditiveBlending, depthWrite: false })));
  root.add(lines);

  // Polvo estelar para profundidad.
  const dust = tier === 'low' ? 260 : 620;
  const dustPositions = new Float32Array(dust * 3);
  for (let i = 0; i < dust; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = 3.4 + Math.random() * 4.2;
    const s = Math.sqrt(1 - u * u);
    dustPositions.set([Math.cos(t) * s * r, u * r * 0.7, Math.sin(t) * s * r], i * 3);
  }
  const dustGeometry = keep(new BufferGeometry());
  dustGeometry.setAttribute('position', new BufferAttribute(dustPositions, 3));
  const points = new Points(dustGeometry, keep(new PointsMaterial({ color: 0x9cc3ff, size: 0.05, map: keep(dotTexture()), transparent: true, opacity: 0.7, depthWrite: false, blending: AdditiveBlending })));
  scene.add(points);

  // Luces de marca.
  scene.add(new AmbientLight(0x8fb4ff, 0.35));
  const lights = [[BRAND.blue, 40, [-4, 2.5, 3]], [BRAND.cyan, 28, [4, -1.5, 3.5]], [BRAND.green, 10, [0, -4, -2]]].map(([color, intensity, position]) => {
    const light = new PointLight(color, intensity, 16, 2);
    light.position.set(...position);
    scene.add(light);
    return light;
  });

  const dummy = new Object3D();
  function update(time, dispersion) {
    nodes.forEach((node, i) => {
      node.current.copy(node.base).multiplyScalar(dispersion);
      node.current.y += Math.sin(time * node.speed + node.phase) * 0.12;
      node.current.x += Math.cos(time * node.speed * 0.8 + node.phase) * 0.06;
      dummy.position.copy(node.current);
      dummy.rotation.set(time * 0.3 + node.phase, time * 0.4 + node.phase * 0.5, 0);
      dummy.scale.setScalar(node.size);
      dummy.updateMatrix();
      cubes.setMatrixAt(i, dummy.matrix);
    });
    cubes.instanceMatrix.needsUpdate = true;
    let k = 0;
    const put = (a, b) => { linePositions.set([a.x, a.y, a.z, b.x, b.y, b.z], k); k += 6; };
    pairs.forEach(([i, j]) => put(nodes[i].current, nodes[j].current));
    const center = new Vector3();
    hubs.forEach(i => put(nodes[i].current, center.copy(nodes[i].current).multiplyScalar(0.5)));
    lineGeometry.attributes.position.needsUpdate = true;
    heart.scale.setScalar(1 + Math.sin(time * 2.1) * 0.08);
    heartLight.intensity = 5 + Math.sin(time * 2.1) * 1.5;
    rings[0].rotation.z = time * 0.12;
    rings[1].rotation.z = -time * 0.09;
    lights[0].position.x = -4 + Math.sin(time * 0.5) * 1.2;
    lights[1].position.y = -1.5 + Math.cos(time * 0.4) * 1.2;
    points.rotation.y = time * 0.015;
  }

  return { scene, root, core, blob, update, dispose: () => disposables.forEach(item => item.dispose?.()) };
}

function makeRenderer(canvas, tier, extra = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: tier !== 'low', alpha: false, powerPreference: tier === 'high' ? 'high-performance' : 'default', ...extra });
  renderer.setClearColor(0x04060b, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.1;
  return renderer;
}

// Monta la escena en .hero-stage. Devuelve una función para desmontarla.
export function mount(stage) {
  performance.mark?.('hero3d:mount');
  const canvas = stage.querySelector('canvas');
  const hero = stage.closest('.hero') || document.body;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');

  // La calidad se decide con un contexto de sondeo desechable, para crear el renderer una sola vez
  // (crear y destruir un contexto en el canvas visible cuesta tiempo y puede trabar el primer cuadro).
  let software = false;
  try {
    const probe = document.createElement('canvas').getContext('webgl2');
    software = probe ? isSoftware(probe) : false;
    probe?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* sin sondeo: calidad por dispositivo */ }
  let tier = pickTier(software);
  // Escala de resolución dinámica: con GPU por software se empieza más bajo y baja si faltan FPS.
  let resolution = software ? 0.7 : 1;
  const renderer = makeRenderer(canvas, tier);
  renderer.transmissionResolutionScale = tier === 'high' ? 1 : 0.6;
  let world = buildScene(renderer, tier);
  const camera = new PerspectiveCamera(34, 1, 0.1, 60);
  stage.dataset.quality = tier;
  stage.dataset.resolution = resolution.toFixed(2);

  let width = 0, height = 0;
  function resize() {
    const rect = stage.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, PIXEL_RATIO[tier]) * resolution);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  resize();

  // Entrada: puntero (parallax con inercia), arrastre táctil (con impulso) y scroll.
  const input = { x: 0, y: 0, spin: 0, spinVelocity: 0, scroll: 0 };
  const state = { rx: 0, ry: 0, camX: 0, camY: 0, scroll: 0 };
  const onPointerMove = event => {
    if (event.pointerType !== 'mouse') return;
    input.x = (event.clientX / innerWidth) * 2 - 1;
    input.y = (event.clientY / innerHeight) * 2 - 1;
  };
  let drag = null;
  const onPointerDown = event => { if (event.pointerType !== 'mouse') drag = { x: event.clientX, t: performance.now() }; };
  const onDragMove = event => {
    if (!drag || event.pointerType === 'mouse') return;
    const now = performance.now();
    const dx = event.clientX - drag.x;
    input.spin += dx * 0.008;
    input.spinVelocity = (dx * 0.008) / Math.max(0.008, (now - drag.t) / 1000);
    drag = { x: event.clientX, t: now };
  };
  const onPointerUp = () => { drag = null; };
  const onScroll = () => { input.scroll = MathUtils.clamp(scrollY / Math.max(1, hero.offsetHeight), 0, 1); };
  addEventListener('pointermove', onPointerMove, { passive: true });
  hero.addEventListener('pointerdown', onPointerDown, { passive: true });
  hero.addEventListener('pointermove', onDragMove, { passive: true });
  addEventListener('pointerup', onPointerUp, { passive: true });
  addEventListener('pointercancel', onPointerUp, { passive: true });
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Giroscopio: solo si el navegador no pide permiso y la política de permisos lo admite.
  let onOrientation = null;
  const policy = document.permissionsPolicy || document.featurePolicy;
  const gyroAllowed = 'DeviceOrientationEvent' in window && typeof DeviceOrientationEvent.requestPermission !== 'function'
    && (!policy || (policy.allowsFeature('gyroscope') && policy.allowsFeature('accelerometer')));
  if (gyroAllowed && !finePointer.matches) {
    onOrientation = event => {
      if (event.gamma == null) return;
      input.x = MathUtils.clamp(event.gamma / 35, -1, 1);
      input.y = MathUtils.clamp((event.beta - 45) / 35, -1, 1);
    };
    addEventListener('deviceorientation', onOrientation, { passive: true });
  }

  // Bucle de render: se pausa cuando la portada no se ve o la pestaña está oculta.
  // La escena se muestra (fundido CSS) cuando ya hay cuadros fluidos y ~0.22s de animación,
  // con el fotograma estático retirado al instante: nunca un pose congelado al revelar.
  let visible = true, raf = 0, last = 0, time = 0, renderedFrames = 0, smoothFrames = 0, shown = false, ready = false;
  let sampleTime = 0, sampleFrames = 0;
  const INTRO = 1.6;
  const easeOut = t => 1 - Math.pow(1 - MathUtils.clamp(t, 0, 1), 3);
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const rawDt = last ? (now - last) / 1000 : 0;
    const dt = Math.min(0.05, rawDt || 0.016);
    last = now;
    time += dt;
    // Intro: los nodos llegan desde fuera y el conjunto gira hasta su sitio.
    const intro = easeOut(time / INTRO);

    input.spinVelocity = drag ? input.spinVelocity : damp(input.spinVelocity, 0, 2.5, dt);
    if (!drag) input.spin += input.spinVelocity * dt;
    state.ry = damp(state.ry, input.x * 0.45 + input.spin, 3.2, dt);
    state.rx = damp(state.rx, input.y * 0.28, 3.2, dt);
    state.camX = damp(state.camX, input.x * 0.35, 2.2, dt);
    state.camY = damp(state.camY, -input.y * 0.22, 2.2, dt);
    state.scroll = damp(state.scroll, input.scroll, 6, dt);

    const s = state.scroll;
    world.root.rotation.set(state.rx + s * 0.45 + (1 - intro) * 0.35, state.ry + time * 0.06 + s * 1.4 - (1 - intro) * 1.1, 0);
    world.core.rotation.set(time * 0.12, time * 0.18, 0);
    world.blob.scale.setScalar((1 - s * 0.12) * (0.8 + 0.2 * intro));
    world.update(time, 1 + s * 0.85 + (1 - intro) * 1.4);
    const fit = camera.aspect < 1 ? 1 / camera.aspect : 1;
    camera.position.set(state.camX, state.camY, (9.2 + s * 2.6) * Math.min(fit, 1.6));
    camera.lookAt(0, 0, 0);
    renderer.render(world.scene, camera);

    renderedFrames++;
    // Se muestra solo cuando la animación ya lleva frames fluidos Y tiempo real de movimiento
    // (aún invisible): así el primer frame visible ya está en marcha, no un pose estático.
    // Tope de seguridad a 90 cuadros por si el reloj del tab llega raro.
    smoothFrames = rawDt > 0 && rawDt < 0.1 ? smoothFrames + 1 : 0;
    const motionReady = smoothFrames >= 3 && time >= 0.22;
    if (!shown && (motionReady || renderedFrames >= 90)) {
      shown = true;
      performance.mark?.('hero3d:live');
      stage.classList.add('is-live');
      stage.dataset.state = 'live';
    }
    // Calidad adaptativa: si el promedio baja de ~30 FPS, primero quita la transmisión (pase extra)
    // y después reduce la resolución por pasos hasta la mitad.
    sampleTime += dt; sampleFrames++;
    if (sampleFrames === 60) {
      if (sampleTime / sampleFrames > 1 / 30) {
        if (tier !== 'low') {
          tier = 'low';
          const old = world;
          world = buildScene(renderer, 'low');
          old.dispose();
        } else if (resolution > 0.5) {
          resolution = Math.max(0.5, resolution - 0.15);
        }
        stage.dataset.quality = tier;
        stage.dataset.resolution = resolution.toFixed(2);
        resize();
      }
      sampleTime = 0; sampleFrames = 0;
    }
  }
  const start = () => { if (ready && !raf && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; visible ? start() : stop(); });
  observer.observe(stage);
  const onVisibility = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVisibility);

  function unmount() {
    stop();
    observer.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('pointermove', onPointerMove);
    hero.removeEventListener('pointerdown', onPointerDown);
    hero.removeEventListener('pointermove', onDragMove);
    removeEventListener('pointerup', onPointerUp);
    removeEventListener('pointercancel', onPointerUp);
    removeEventListener('scroll', onScroll);
    if (onOrientation) removeEventListener('deviceorientation', onOrientation);
    reduced.removeEventListener('change', onReduced);
    world.dispose();
    renderer.dispose();
    stage.classList.remove('is-live');
    stage.dataset.state = 'fallback';
  }
  // Si el usuario activa "reducir movimiento", se vuelve a la imagen estática.
  const onReduced = () => { if (reduced.matches) unmount(); };
  reduced.addEventListener('change', onReduced);
  // Precompila los shaders en paralelo (KHR_parallel_shader_compile, habitual con GPU real) antes del
  // primer cuadro; sin esa extensión se compilan en el primer render, con la escena aún invisible.
  const warm = renderer.extensions.has('KHR_parallel_shader_compile') ? renderer.compileAsync(world.scene, camera) : Promise.resolve();
  warm.catch(() => {}).then(() => {
    performance.mark?.('hero3d:compiled');
    if (stage.dataset.state === 'fallback') return;
    ready = true;
    start();
  });
  return unmount;
}

// Genera un fotograma fijo (PNG con transparencia) para la imagen de respaldo.
export function renderStill(width, height, options = {}) {
  const canvas = document.createElement('canvas');
  const renderer = makeRenderer(canvas, 'high', { preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  const world = buildScene(renderer, options.tier || 'high');
  const camera = new PerspectiveCamera(34, width / height, 0.1, 60);
  const fit = camera.aspect < 1 ? 1 / camera.aspect : 1;
  camera.position.set(0.15, 0.05, 9.2 * Math.min(fit, 1.6));
  camera.lookAt(0, 0, 0);
  const time = options.time ?? 2.4;
  world.root.rotation.set(0.12, 0.5 + time * 0.06, 0);
  world.core.rotation.set(time * 0.12, time * 0.18, 0);
  world.update(time, 1);
  renderer.render(world.scene, camera);
  const url = canvas.toDataURL('image/png');
  world.dispose();
  renderer.dispose();
  return url;
}
