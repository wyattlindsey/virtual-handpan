/**
 * WebGL view of the instrument: the shell geometry from the layout, a
 * physically based steel material with a procedural heat-tint map, a
 * constrained orbit so the pan can be tilted but never lost, and a flip to
 * look at the underside. Strikes are found by ray casting and matched to
 * the nearest field on the hit surface.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { type FieldPosition, type Layout, allFieldPositions, fieldXY } from '../model/layout';
import { type Spelling, formatPitch } from '../model/pitch';
import {
  type Bump, type ShellGeometry, type SurfaceData, bottomHeightAt, buildShell, dimpleNormalMap, topHeightAt,
} from '../model/shell3d';
import { makeHeatTintMaps } from './heatTint';
import type { StrikeInfo } from './PanView';

interface Props {
  layout: Layout;
  spelling: Spelling;
  flashes: Record<string, number>;
  keyHints?: Record<string, string>;
  onStrike: (info: StrikeInfo) => void;
}

interface FieldNode {
  field: FieldPosition;
  bump: Bump;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  label: CSS2DObject;
  struckAt: number;
}

interface SceneState {
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  pan: THREE.Group;
  material: THREE.MeshPhysicalMaterial;
  bottomMaterial: THREE.MeshPhysicalMaterial;
  top: THREE.Mesh;
  bottom: THREE.Mesh;
  fields: FieldNode[];
  raf: number;
  flipTarget: number;
  /** True while the camera eases back to the home view. */
  homing: boolean;
  dispose: () => void;
}

const FLASH_SECONDS = 0.8;
const HOME = new THREE.Vector3(0, 3.6, 1.3);

function toGeometry(s: SurfaceData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(s.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(s.normals, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(s.uvs, 2));
  g.setIndex(new THREE.BufferAttribute(s.indices, 1));
  return g;
}

export function PanView3D({ layout, spelling, flashes, keyHints, onStrike }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SceneState | null>(null);
  const [flipped, setFlipped] = useState(false);
  const propsRef = useRef({ layout, spelling, keyHints, onStrike });
  propsRef.current = { layout, spelling, keyHints, onStrike };
  const prevFlashes = useRef<Record<string, number>>({});

  // Scene setup, once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    renderer.domElement.className = 'pan3d-canvas';

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'pan3d-labels';
    host.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.copy(HOME);
    camera.lookAt(0, 0, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xfff2e0, 1.6);
    key.position.set(-2.2, 4, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = key.shadow.camera.bottom = -2;
    key.shadow.camera.right = key.shadow.camera.top = 2;
    key.shadow.radius = 4;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb9d4ff, 0.5);
    fill.position.set(2.5, 2, -2);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight(0x8fb4e8, 0x0b0f18, 0.35));

    // Ground that only shows the shadow.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.45 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.34;
    ground.receiveShadow = true;
    scene.add(ground);

    const maps = makeHeatTintMaps();
    const colorMap = new THREE.CanvasTexture(maps.color);
    colorMap.colorSpace = THREE.SRGBColorSpace;
    colorMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const roughnessMap = new THREE.CanvasTexture(maps.roughness);
    const material = new THREE.MeshPhysicalMaterial({
      map: colorMap,
      roughnessMap,
      metalness: 0.85,
      roughness: 0.52,
      clearcoat: 0.12,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.55,
    });

    // The underside gets its own material so it can carry its own dimple normal map.
    const bottomMaterial = material.clone();

    const pan = new THREE.Group();
    scene.add(pan);
    const top = new THREE.Mesh(new THREE.BufferGeometry(), material);
    const bottom = new THREE.Mesh(new THREE.BufferGeometry(), bottomMaterial);
    top.castShadow = bottom.castShadow = true;
    top.receiveShadow = true;
    pan.add(top, bottom);

    // Rim seam and the gu's inner wall.
    const seam = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.012, 12, 200),
      new THREE.MeshStandardMaterial({ color: 0x9fb3cc, metalness: 0.9, roughness: 0.35 }),
    );
    seam.rotation.x = Math.PI / 2;
    seam.castShadow = true;
    pan.add(seam);
    const gu = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 0.09, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x0c1526, metalness: 0.8, roughness: 0.6, side: THREE.DoubleSide }),
    );
    gu.position.y = -0.2 + 0.045;
    pan.add(gu);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.6;
    controls.maxDistance = 4.8;
    controls.minPolarAngle = 0.02;
    controls.maxPolarAngle = 1.15;
    // A small swing only: the lowest note stays toward the player.
    controls.minAzimuthAngle = -0.2;
    controls.maxAzimuthAngle = 0.2;
    controls.rotateSpeed = 0.6;
    controls.zoomSpeed = 0.6;

    const state: SceneState = {
      renderer, labelRenderer, scene, camera, controls, pan, material, bottomMaterial, top, bottom, fields: [], raf: 0, flipTarget: 0,
      homing: false,
      dispose: () => {},
    };
    stateRef.current = state;

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      labelRenderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // Strikes: ray cast, then the nearest field on the hit side.
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const onPointerDown = (e: PointerEvent) => {
      // A drag rotates; only a press without movement strikes. Detect on pointerup.
      const startX = e.clientX, startY = e.clientY, startT = performance.now();
      const onUp = (u: PointerEvent) => {
        window.removeEventListener('pointerup', onUp);
        if (Math.hypot(u.clientX - startX, u.clientY - startY) > 6 || performance.now() - startT > 400) return;
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set(((u.clientX - rect.left) / rect.width) * 2 - 1, -((u.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects([top, bottom], false);
        const hit = hits[0];
        if (!hit) return;
        const local = pan.worldToLocal(hit.point.clone());
        const side = hit.object === top ? 'top' : 'bottom';
        let best: { node: FieldNode; d: number } | null = null;
        for (const node of state.fields) {
          const onTop = node.field.side !== 'bottom';
          if ((side === 'top') !== onTop) continue;
          const dx = local.x - node.bump.x;
          const dz = local.z - node.bump.y;
          const rad = (node.bump.angleDeg * Math.PI) / 180;
          const uu = dx * Math.cos(rad) + dz * Math.sin(rad);
          const vv = -dx * Math.sin(rad) + dz * Math.cos(rad);
          const d = Math.sqrt((uu / node.bump.rx) ** 2 + (vv / node.bump.ry) ** 2);
          if (d < 1.25 && (!best || d < best.d)) best = { node, d };
        }
        if (!best) return;
        const velocity = Math.min(1, Math.max(0.4, 1 - 0.45 * best.d));
        propsRef.current.onStrike({ fieldId: best.node.field.id, pitch: best.node.field.pitch, side: best.node.field.side, velocity });
      };
      window.addEventListener('pointerup', onUp);
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    const cancelHoming = () => { state.homing = false; };
    controls.addEventListener('start', cancelHoming);

    // Once the zoom is at its limit, wheel scrolling belongs to the page again.
    const onWheelCapture = (e: WheelEvent) => {
      const dist = camera.position.distanceTo(controls.target);
      const atMax = dist >= controls.maxDistance - 1e-3;
      const atMin = dist <= controls.minDistance + 1e-3;
      if ((e.deltaY > 0 && atMax) || (e.deltaY < 0 && atMin)) e.stopPropagation();
    };
    host.addEventListener('wheel', onWheelCapture, { capture: true, passive: true });

    // On narrow screens one finger scrolls the page (touch-action: pan-y in CSS); two fingers orbit and zoom.
    const narrow = window.matchMedia('(max-width: 1000px)');
    const applyTouch = () => {
      controls.touches.ONE = narrow.matches ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
      controls.touches.TWO = narrow.matches ? THREE.TOUCH.DOLLY_ROTATE : THREE.TOUCH.DOLLY_PAN;
    };
    applyTouch();
    narrow.addEventListener('change', applyTouch);

    const clock = new THREE.Clock();
    const loop = () => {
      state.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      if (state.homing) {
        // Ease the camera home; a user drag cancels it.
        const k = Math.min(1, dt * 9);
        camera.position.lerp(HOME, k);
        controls.target.lerp(new THREE.Vector3(0, 0, 0), k);
        if (camera.position.distanceTo(HOME) < 0.004) { camera.position.copy(HOME); controls.target.set(0, 0, 0); state.homing = false; }
      }
      controls.update();
      // Ease the flip.
      const target = state.flipTarget;
      const diff = target - pan.rotation.x;
      if (Math.abs(diff) > 1e-4) pan.rotation.x += diff * Math.min(1, dt * 7);
      else pan.rotation.x = target;
      const now = performance.now() / 1000;
      for (const f of state.fields) {
        const age = now - f.struckAt;
        f.ring.material.opacity = age < FLASH_SECONDS ? 0.85 * (1 - age / FLASH_SECONDS) : 0;
        f.ring.visible = f.ring.material.opacity > 0.01;
        // Labels fade when their side faces away.
        const facingUp = Math.cos(pan.rotation.x) > 0;
        const onTop = f.field.side !== 'bottom';
        f.label.visible = onTop === facingUp;
      }
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    loop();

    state.dispose = () => {
      cancelAnimationFrame(state.raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      controls.removeEventListener('start', cancelHoming);
      host.removeEventListener('wheel', onWheelCapture, { capture: true });
      narrow.removeEventListener('change', applyTouch);
      controls.dispose();
      for (const f of state.fields) { f.ring.geometry.dispose(); f.ring.material.dispose(); }
      top.geometry.dispose();
      bottom.geometry.dispose();
      seam.geometry.dispose();
      gu.geometry.dispose();
      material.normalMap?.dispose();
      bottomMaterial.normalMap?.dispose();
      material.dispose();
      bottomMaterial.dispose();
      colorMap.dispose();
      roughnessMap.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    };
    return () => { state.dispose(); stateRef.current = null; };
  }, []);

  // Rebuild the shell and field markers when the layout changes.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const shell: ShellGeometry = buildShell(layout);
    state.top.geometry.dispose();
    state.bottom.geometry.dispose();
    state.top.geometry = toGeometry(shell.top);
    state.bottom.geometry = toGeometry(shell.bottom);

    // Dimples shade per pixel from a normal map; the underside's frame is mirrored, so flip its green.
    const applyNormalMap = (mat: THREE.MeshPhysicalMaterial, bumps: Bump[], flipY: boolean) => {
      mat.normalMap?.dispose();
      const size = 1024;
      const tex = new THREE.DataTexture(dimpleNormalMap(bumps, size), size, size, THREE.RGBAFormat);
      tex.flipY = true;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = Math.min(8, state.renderer.capabilities.getMaxAnisotropy());
      tex.needsUpdate = true;
      mat.normalMap = tex;
      mat.normalScale.set(1, flipY ? -1 : 1);
      mat.needsUpdate = true;
    };
    applyNormalMap(state.material, shell.bumps.top, false);
    applyNormalMap(state.bottomMaterial, shell.bumps.bottom, true);

    for (const f of state.fields) {
      state.pan.remove(f.ring, f.label);
      f.ring.geometry.dispose();
      f.ring.material.dispose();
      f.label.element.remove();
    }
    const bumps = [...shell.bumps.top, ...shell.bumps.bottom];
    state.fields = allFieldPositions(layout).map((field, i) => {
      const bump = bumps[i]!;
      const onTop = field.side !== 'bottom';
      const h = onTop ? topHeightAt(bump.x, bump.y, shell.bumps.top) : bottomHeightAt(bump.x, bump.y, shell.bumps.bottom);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.78, 1.0, 64),
        new THREE.MeshBasicMaterial({ color: 0xf0c46b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      );
      ring.scale.set(bump.rx * 1.08, bump.ry * 1.08, 1);
      ring.rotation.set(-Math.PI / 2, 0, -(bump.angleDeg * Math.PI) / 180);
      ring.position.set(bump.x, h + (onTop ? 0.015 : -0.015), bump.y);
      ring.visible = false;
      state.pan.add(ring);

      const el = document.createElement('div');
      el.className = `label3d${field.side === 'ding' ? ' ding' : ''}`;
      const label = new CSS2DObject(el);
      const { x, y } = fieldXY(field);
      const labelOffset = field.side === 'ding' ? bump.rx + 0.06 : bump.ry + 0.05;
      label.position.set(x, h + (onTop ? 0.03 : -0.03), y + (onTop ? labelOffset : -labelOffset) * (field.side === 'bottom' ? -1 : 1));
      state.pan.add(label);
      return { field, bump, ring, label, struckAt: -10 };
    });
    prevFlashes.current = {};
    // Fill labels with the current spelling.
    for (const f of state.fields) {
      f.label.element.innerHTML = '';
      const pitch = document.createElement('span');
      pitch.textContent = formatPitch(f.field.pitch, propsRef.current.spelling);
      f.label.element.appendChild(pitch);
      const hint = propsRef.current.keyHints?.[f.field.id];
      if (hint) {
        const k = document.createElement('small');
        k.textContent = hint;
        f.label.element.appendChild(k);
      }
    }
  }, [layout, spelling, keyHints]);

  // Light up struck fields.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const now = performance.now() / 1000;
    for (const f of state.fields) {
      const n = flashes[f.field.id];
      if (n !== undefined && n !== prevFlashes.current[f.field.id]) f.struckAt = now;
    }
    prevFlashes.current = { ...flashes };
  }, [flashes]);

  useEffect(() => {
    const state = stateRef.current;
    if (state) state.flipTarget = flipped ? Math.PI : 0;
  }, [flipped]);

  const resetView = () => {
    setFlipped(false);
    const state = stateRef.current;
    if (state) { state.flipTarget = 0; state.homing = true; }
  };

  return (
    <div className="pan3d" ref={hostRef}>
      <div className="pan3d-buttons">
        <button type="button" className="mini" onClick={() => setFlipped((f) => !f)}>
          {flipped ? '↺ Show top' : '↻ Show underside'}
        </button>
        <button type="button" className="mini" onClick={resetView} title="Back to the overhead view">
          ⌂ Reset view
        </button>
      </div>
    </div>
  );
}
