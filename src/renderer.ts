// 3D Renderer v3 — Three.js scene, bloom, enhanced visuals

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { SimulationState, Entity } from './simulation';

export class Renderer3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  composer: EffectComposer;
  container: HTMLElement;

  private entityMeshes: Map<number, THREE.Group> = new Map();
  private buildingMeshes: THREE.Mesh[] = [];
  private windowGlows: { mesh: THREE.Mesh; baseEmissive: number; x: number; z: number; buildingId: number }[] = [];
  // Extra window parts (frames, rights, sills) not tracked in windowGlows
  private windowExtraParts: THREE.Mesh[] = [];
  private roadMeshes: THREE.Mesh[] = [];
  private parkMeshes: THREE.Mesh[] = [];
  private treeMeshes: THREE.Mesh[] = [];
  private bushMeshes: THREE.Mesh[] = [];
  private debrisDots: THREE.Mesh[] = [];
  private wallMeshes: THREE.Mesh[] = [];
  private specialBuildingLights: THREE.Mesh[] = [];
  // Roof occupant indicators: small blue dots directly on building roof
  private buildingOccupantDots: Map<number, THREE.Mesh[]> = new Map();

  private ambient: THREE.AmbientLight;
  private directional: THREE.DirectionalLight;
  private hemisphere: THREE.HemisphereLight;

  // Particles
  private particles: THREE.Points;
  private particleGeom: THREE.BufferGeometry;
  private particlePositions: Float32Array;
  private particleColors: Float32Array;
  private particleSizes: Float32Array;
  private particleData: { vx: number; vz: number; life: number; maxLife: number; r: number; g: number; b: number }[] = [];
  private particleIdx = 0;


  // Sky / atmosphere
  private sky: THREE.Mesh;
  private moon: THREE.Mesh;

  // Ground
  private ground: THREE.Mesh;
  private nightOverlay: THREE.Mesh;
  private gridHelper: THREE.GridHelper;

  // Road markings
  private roadMarkings: THREE.Line[] = [];
  private roadCurbLines: THREE.Line[] = [];
  private crosswalkMeshes: THREE.Mesh[] = [];

  // Shoot tracer lines with per-tracer fade metadata
  private tracers: THREE.Line[] = [];

  // Blood decals
  private bloodDecals: THREE.Mesh[] = [];
  private decalCount = 0;

  // Corpse/skeleton system
  // Corpses: blood pool meshes on ground with fade timers
  private corpseGroups: THREE.Mesh[] = [];
  private corpseTimers: number[] = [];
  private previousAliveZombieIds: Set<number> = new Set();

  // No screen shake (removed for performance)

  // Starving civilians shake offset tracking
  private starvingShakeOffsets: Map<number, number> = new Map();
  private starvingExclamationSprites: Map<number, THREE.Sprite> = new Map();

  // Entity geometry caches
  private civilianGeom: THREE.BufferGeometry;
  private civilianHeadGeom: THREE.BufferGeometry | null;
  private zombieGeom: THREE.BufferGeometry;
  private militaryGeom: THREE.BufferGeometry;
  // Building light meshes at night
  private buildingWindowLights: { mesh: THREE.Mesh; x: number; z: number }[] = [];

  // Cached dot geometry for building occupant indicators (avoids per-frame alloc)
  private occupantDotGeom: THREE.BufferGeometry;

  // Alert ring visual effects (expanding green ring pulses)
  private alertRings: { mesh: THREE.Mesh; maxRadius: number; life: number; maxLife: number }[] = [];
  // Ring geometry and material cache
  private ringGeom: THREE.RingGeometry;
  private ringMat: THREE.MeshBasicMaterial;

  // Deployment drop effects
  private deployDrops: { mesh: THREE.Mesh; targetY: number; speed: number; life: number }[] = [];

  // Supply crate meshes
  private supplyCrateMeshes: THREE.Object3D[] = [];
  private supplyCrateGlows: THREE.Mesh[] = [];

  // Track last processed event index to avoid re-processing tracers
  private lastProcessedEvents = 0;

  // Horde surge shockwaves (expanding red rings)
  private hordeSurges: { mesh: THREE.Mesh; maxRadius: number; life: number; maxLife: number }[] = [];
  private hordeSurgeGeom: THREE.RingGeometry;
  private hordeSurgeMat: THREE.MeshBasicMaterial;

  // Building fire positions that continuously emit particles
  private buildingFires: { x: number; z: number; buildingId: number; timeLeft: number }[] = [];

  // Helicopter flyover
  private helicopterGroup: THREE.Group | null = null;
  private helicopterActive = false;
  private helicopterSx = 0; private helicopterSz = 0;
  private helicopterEx = 0; private helicopterEz = 0;
  private helicopterX = 0; private helicopterZ = 0;
  private helicopterProgress = 0;
  private helicopterTimer = 40 + Math.random() * 30;
  private helicopterFlightTime = 0;
  private helicopterStartRealTime = 0;
  // Helicopter shadow
  private helicopterShadow: THREE.Mesh | null = null;
  // Helicopter particle trail
  private helicopterTrailActive = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 2.0;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    // Reduced fog density so city stays visible when zoomed out
    this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.008);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 250);
    this.camera.position.set(38, 30, 38);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.5;
    this.controls.keyPanSpeed = 10;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 150;
    this.controls.target.set(0, 0, 0);

    // ─── Composer with Bloom ───
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.6,   // strength — slightly increased for entity glow
      0.3,   // radius — crispier glow
      0.04   // threshold — lower to catch more glow
    );
    this.composer.addPass(bloomPass);

    // ─── Lights ───
    this.hemisphere = new THREE.HemisphereLight(0x87CEEB, 0x3a2a1a, 0.8);
    this.scene.add(this.hemisphere);

    this.ambient = new THREE.AmbientLight(0x404060, 0.8);
    this.scene.add(this.ambient);

    // ─── Fill light from below for drama ───
    const fillLight = new THREE.DirectionalLight(0x446688, 0.4);
    fillLight.position.set(-20, 10, -30);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x8866aa, 0.3);
    rimLight.position.set(-20, 5, 30);
    this.scene.add(rimLight);

    this.directional = new THREE.DirectionalLight(0xffeedd, 1.5);
    this.directional.position.set(30, 50, 20);
    this.directional.castShadow = true;
    this.directional.shadow.mapSize.set(2048, 2048);
    this.directional.shadow.camera.near = 0.5;
    this.directional.shadow.camera.far = 150;
    this.directional.shadow.camera.left = -50;
    this.directional.shadow.camera.right = 50;
    this.directional.shadow.camera.top = 50;
    this.directional.shadow.camera.bottom = -50;
    this.scene.add(this.directional);

    // ─── Sky dome ───
    const skyGeom = new THREE.SphereGeometry(120, 24, 24);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x0a0a2a,
      side: THREE.BackSide,
    });
    this.sky = new THREE.Mesh(skyGeom, skyMat);
    this.scene.add(this.sky);

    // ─── Moon ───
    const moonGeom = new THREE.CircleGeometry(1.5, 16);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xeeeedd,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    this.moon = new THREE.Mesh(moonGeom, moonMat);
    this.moon.position.set(25, 65, -20);
    this.scene.add(this.moon);

    // Moon glow ring
    const glowRingGeom = new THREE.RingGeometry(1.6, 2.8, 24);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0xaaccff,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const glowRing = new THREE.Mesh(glowRingGeom, glowRingMat);
    glowRing.position.copy(this.moon.position);
    glowRing.lookAt(0, 0, 0);
    this.moon.add(glowRing);

    // ─── Ground with higher resolution and subtle vertex color variation ───
    const groundGeom = new THREE.PlaneGeometry(70, 70, 15, 15);
    // Add subtle random tint per vertex for ground texture variation
    const posAttr = groundGeom.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const variation = 0.85 + Math.random() * 0.3;
      colors[i * 3] = 0.1 * variation;
      colors[i * 3 + 1] = 0.16 * variation;
      colors[i * 3 + 2] = 0.1 * variation;
    }
    groundGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a2a1a,
      roughness: 0.9,
      metalness: 0.0,
      vertexColors: true,
    });
    this.ground = new THREE.Mesh(groundGeom, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.1;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // ─── Grid helper ───
    this.gridHelper = new THREE.GridHelper(70, 30, 0x2a4a2a, 0x1a2a1a);
    this.gridHelper.position.y = 0.01;
    this.gridHelper.material.transparent = true;
    this.gridHelper.material.opacity = 0.15;
    this.scene.add(this.gridHelper);

    // ─── Subtle ground grid texture overlay ───
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = 256;
    gridCanvas.height = 256;
    const gctx = gridCanvas.getContext('2d')!;
    gctx.fillStyle = 'rgba(0,0,0,0)';
    gctx.fillRect(0, 0, 256, 256);
    gctx.strokeStyle = 'rgba(60,100,60,0.15)';
    gctx.lineWidth = 1;
    const gridStep = 16;
    for (let i = 0; i <= 256; i += gridStep) {
      gctx.beginPath(); gctx.moveTo(i, 0); gctx.lineTo(i, 256); gctx.stroke();
      gctx.beginPath(); gctx.moveTo(0, i); gctx.lineTo(256, i); gctx.stroke();
    }
    const gridTex = new THREE.CanvasTexture(gridCanvas);
    gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
    gridTex.repeat.set(4, 4);
    const gridOverlayMat = new THREE.MeshBasicMaterial({
      map: gridTex,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const gridOverlay = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), gridOverlayMat);
    gridOverlay.rotation.x = -Math.PI / 2;
    gridOverlay.position.y = 0.015;
    this.scene.add(gridOverlay);

    // ─── Night overlay ───
    const overlayGeom = new THREE.PlaneGeometry(140, 140);
    const overlayMat = new THREE.MeshBasicMaterial({
      color: 0x000018,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.nightOverlay = new THREE.Mesh(overlayGeom, overlayMat);
    this.nightOverlay.position.y = 12;
    this.nightOverlay.rotation.x = -Math.PI / 2;
    this.scene.add(this.nightOverlay);

    // ─── Entity geometry cache (low-poly colored spheres) ───
    this.civilianGeom = new THREE.SphereGeometry(0.2, 12, 8);
    this.civilianHeadGeom = null as any;  // No separate head - just one sphere
    this.zombieGeom = new THREE.SphereGeometry(0.22, 10, 8);
    this.militaryGeom = new THREE.SphereGeometry(0.23, 10, 8);
    this.occupantDotGeom = new THREE.PlaneGeometry(1.0, 1.0, 2, 2);

    // ─── Alert ring geometry ───
    this.ringGeom = new THREE.RingGeometry(0.02, 0.08, 24);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x33ff33,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // ─── Horde surge shockwave geometry ───
    this.hordeSurgeGeom = new THREE.RingGeometry(0.05, 0.18, 32);
    this.hordeSurgeMat = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // ─── Particle system (effects) ───
    this.particleGeom = new THREE.BufferGeometry();
    const PARTICLE_COUNT = 2000;
    this.particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    this.particleColors = new Float32Array(PARTICLE_COUNT * 3);
    this.particleSizes = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particlePositions[i * 3] = 0;
      this.particlePositions[i * 3 + 1] = -10;
      this.particlePositions[i * 3 + 2] = 0;
      this.particleSizes[i] = 0;
      this.particleData.push({ vx: 0, vz: 0, life: 0, maxLife: 0, r: 1, g: 1, b: 1 });
    }
    this.particleGeom.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleGeom.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    this.particleGeom.setAttribute('size', new THREE.BufferAttribute(this.particleSizes, 1));

    const particleMat = new THREE.PointsMaterial({
      size: 0.3,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.particles = new THREE.Points(this.particleGeom, particleMat);
    this.scene.add(this.particles);



    // Resize
    window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    });
  }

  buildCity(state: SimulationState): void {
    this.clearMeshes();

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.85, metalness: 0.3 });
    const roadEdgeMat = new THREE.MeshStandardMaterial({ color: 0x4a4a5a, roughness: 0.8, metalness: 0.1 });
    for (const r of state.map.roads) {
      const geom = new THREE.PlaneGeometry(r.w * 0.95, r.d * 0.95, 2, 2);
      const mesh = new THREE.Mesh(geom, roadMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(r.x, 0.01, r.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.roadMeshes.push(mesh);
    }

    // Road center markings — brighter and more visible
    const dashMat = new THREE.LineBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.4 });
    for (const r of state.map.roads) {
      if (r.w > 2.8 || r.d > 2.8) {
        const isHorizontal = r.w > r.d;
        const len = isHorizontal ? r.w : r.d;
        const segments = Math.floor(len / 0.5);
        for (let s = 0; s < segments; s += 2) {
          const start = -len / 2 + s * 0.5;
          const end = start + 0.3;
          const pts: THREE.Vector3[] = [];
          if (isHorizontal) {
            pts.push(new THREE.Vector3(r.x + start, 0.03, r.z));
            pts.push(new THREE.Vector3(r.x + end, 0.03, r.z));
          } else {
            pts.push(new THREE.Vector3(r.x, 0.03, r.z + start));
            pts.push(new THREE.Vector3(r.x, 0.03, r.z + end));
          }
          const g = new THREE.BufferGeometry().setFromPoints(pts);
          const line = new THREE.Line(g, dashMat);
          this.scene.add(line);
          this.roadMarkings.push(line);
        }
      }
    }

    // Road curb lines — thin white lines along road edges
    const curbMat = new THREE.LineBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.15 });
    for (const r of state.map.roads) {
      if (r.w > 2.8 || r.d > 2.8) {
        const isHorizontal = r.w > r.d;
        const halfLen = (isHorizontal ? r.w : r.d) / 2;
        const offset = 0.4;
        if (isHorizontal) {
          // Two lines along z-edges
          const pts1 = [new THREE.Vector3(r.x - halfLen, 0.025, r.z - offset), new THREE.Vector3(r.x + halfLen, 0.025, r.z - offset)];
          const pts2 = [new THREE.Vector3(r.x - halfLen, 0.025, r.z + offset), new THREE.Vector3(r.x + halfLen, 0.025, r.z + offset)];
          const g1 = new THREE.BufferGeometry().setFromPoints(pts1);
          const g2 = new THREE.BufferGeometry().setFromPoints(pts2);
          const l1 = new THREE.Line(g1, curbMat); this.scene.add(l1); this.roadCurbLines.push(l1);
          const l2 = new THREE.Line(g2, curbMat); this.scene.add(l2); this.roadCurbLines.push(l2);
        } else {
          const pts1 = [new THREE.Vector3(r.x - offset, 0.025, r.z - halfLen), new THREE.Vector3(r.x - offset, 0.025, r.z + halfLen)];
          const pts2 = [new THREE.Vector3(r.x + offset, 0.025, r.z - halfLen), new THREE.Vector3(r.x + offset, 0.025, r.z + halfLen)];
          const g1 = new THREE.BufferGeometry().setFromPoints(pts1);
          const g2 = new THREE.BufferGeometry().setFromPoints(pts2);
          const l1 = new THREE.Line(g1, curbMat); this.scene.add(l1); this.roadCurbLines.push(l1);
          const l2 = new THREE.Line(g2, curbMat); this.scene.add(l2); this.roadCurbLines.push(l2);
        }
      }
    }

    // Crosswalk markings at intersections (where two major roads cross)
    const crosswalkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    // Find intersection points (roads crossing each other)
    for (let i = 0; i < state.map.roads.length; i++) {
      for (let j = i + 1; j < state.map.roads.length; j++) {
        const a = state.map.roads[i];
        const b = state.map.roads[j];
        // Check if they cross (one horizontal, one vertical)
        const aHoriz = a.w > a.d;
        const bHoriz = b.w > b.d;
        if (aHoriz === bHoriz) continue;
        // Check proximity
        const dx = Math.abs(a.x - b.x);
        const dz = Math.abs(a.z - b.z);
        if (dx < 1.5 && dz < 1.5) {
          // Add crosswalk stripes at this intersection
          for (let s = 0; s < 5; s++) {
            const stripe = new THREE.Mesh(
              new THREE.PlaneGeometry(0.08, 0.35),
              crosswalkMat
            );
            const offset = (s - 2) * 0.2;
            if (aHoriz) {
              stripe.position.set(a.x + offset, 0.04, a.z);
              stripe.rotation.x = -Math.PI / 2;
            } else {
              stripe.position.set(b.x + offset, 0.04, b.z);
              stripe.rotation.x = -Math.PI / 2;
            }
            this.scene.add(stripe);
            this.crosswalkMeshes.push(stripe);
          }
        }
      }
    }

    // Parks
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 1.0 });
    for (const p of state.map.parks) {
      const geom = new THREE.CircleGeometry(p.r * 0.8, 12);
      const mesh = new THREE.Mesh(geom, parkMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, 0.02, p.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.parkMeshes.push(mesh);
      for (let i = 0; i < 3; i++) {
        const tx = p.x + (Math.random() - 0.5) * p.r * 1.5;
        const tz = p.z + (Math.random() - 0.5) * p.r * 1.5;
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.12, 0.5 + Math.random() * 0.4, 6),
          new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 1 })
        );
        trunk.position.set(tx, 0.25, tz);
        trunk.castShadow = true;
        this.scene.add(trunk);
        this.treeMeshes.push(trunk);

        // Fuller tree crown with ConeGeometry (12 segments)
        const crownH = 0.4 + Math.random() * 0.3;
        const crownR = 0.2 + Math.random() * 0.15;
        const crown = new THREE.Mesh(
          new THREE.ConeGeometry(crownR, crownH, 8),
          new THREE.MeshStandardMaterial({ color: 0x2d6a2e, roughness: 0.8 })
        );
        crown.position.set(tx, 0.55 + Math.random() * 0.3, tz);
        crown.castShadow = true;
        this.scene.add(crown);
        this.treeMeshes.push(crown);
      }
      // Small green bush dots scattered in park
      const bushMat = new THREE.MeshStandardMaterial({ color: 0x3a8a3b, roughness: 1.0 });
      for (let bi = 0; bi < 8; bi++) {
        const bx = p.x + (Math.random() - 0.5) * p.r * 1.3;
        const bz = p.z + (Math.random() - 0.5) * p.r * 1.3;
        const bushR = 0.06 + Math.random() * 0.08;
        const bush = new THREE.Mesh(
          new THREE.SphereGeometry(bushR, 6, 5),
          bushMat
        );
        bush.position.set(bx, 0.06, bz);
        bush.castShadow = true;
        this.scene.add(bush);
        this.bushMeshes.push(bush);
      }
    }

    // Buildings
    for (const b of state.buildings) {
      // Destroyed building: render as low grey rubble pile
      if (b.destroyed) {
        const rubbleMat = new THREE.MeshStandardMaterial({
          color: 0x555555,
          roughness: 1.0,
          metalness: 0.0,
        });
        const rubble = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.8, 0.3, b.d * 0.8), rubbleMat);
        rubble.position.set(b.x, 0.15, b.z);
        rubble.castShadow = true;
        rubble.receiveShadow = true;
        this.scene.add(rubble);
        this.buildingMeshes.push(rubble);
        continue;
      }

      const col = new THREE.Color(b.color);
      // Subtle color variation per building of same type (±10%)
      const variation = 0.9 + Math.random() * 0.2;
      col.r = Math.min(1, col.r * variation);
      col.g = Math.min(1, col.g * variation);
      col.b = Math.min(1, col.b * variation);
      const roughnessVar = 0.5 + Math.random() * 0.5;
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: roughnessVar,
        metalness: b.type === 'police' ? 0.4 : 0.1,
        emissive: b.type === 'police' ? new THREE.Color(0x224466) : new THREE.Color(0x000000),
        emissiveIntensity: b.type === 'police' ? 0.15 : 0,
      });
      const geom = new THREE.BoxGeometry(b.w, b.h, b.d, 2, 2, 2);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.buildingId = b.id;
      this.scene.add(mesh);
      this.buildingMeshes.push(mesh);

      // Colored roof by building type (instead of icons)
      const roofColors: Record<string, number> = {
        shop: 0xffdd44,      // Yellow — food
        office: 0xff8844,    // Orange — food (low)
        house: 0xcccccc,     // Light gray — shelter
        warehouse: 0x666666, // Dark gray — ammo + food
        police: 0x2244aa,    // Blue — ammo (high)

      };
      const defaultColor = 0x888888;
      const roofCol = new THREE.Color(roofColors[b.type] || defaultColor);
      const roofMat2 = new THREE.MeshStandardMaterial({
        color: roofCol,
        roughness: 0.8,
        metalness: 0.1,
        emissive: roofCol,
        emissiveIntensity: 0.05,
      });
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.95, b.d * 0.95, 2, 2), roofMat2);
      roof.rotation.x = -Math.PI / 2;
      roof.position.set(b.x, b.h + 0.05, b.z);
      this.scene.add(roof);
      this.buildingMeshes.push(roof);





      // Ground-contact shadow/glow at building base for ambient occlusion
      const contactMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      });
      const contactShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(b.w * 1.05, b.d * 1.05),
        contactMat
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.set(b.x, 0.01, b.z);
      this.scene.add(contactShadow);
      this.buildingMeshes.push(contactShadow);

      // Police station light bar — enhanced with brighter glow
      if (b.type === 'police') {
        const lightMat = new THREE.MeshStandardMaterial({
          color: 0x0044ff,
          emissive: 0x0044ff,
          emissiveIntensity: 1.0,
        });
        const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.15), lightMat);
        lightBar.position.set(b.x, b.h + 0.08, b.z);
        this.scene.add(lightBar);
        this.specialBuildingLights.push(lightBar);

        const lightMat2 = new THREE.MeshStandardMaterial({
          color: 0xff0000,
          emissive: 0xff0000,
          emissiveIntensity: 1.0,
        });
        const lightBar2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.5), lightMat2);
        lightBar2.position.set(b.x, b.h + 0.08, b.z);
        this.scene.add(lightBar2);
        this.specialBuildingLights.push(lightBar2);


      }


      // Windows with glow — casement pairs with sill, warm night glow
      const hasWindows = b.type !== 'warehouse';
      if (hasWindows) {
        const winCountX = Math.max(2, Math.floor(b.w / 0.6));
        const winCountZ = Math.max(2, Math.floor(b.d / 0.6));
        for (let wy = 0.4; wy < b.h - 0.2; wy += 0.6) {
          // 4 sides: 0=front(+Z), 1=back(-Z), 2=left(-X), 3=right(+X)
          const sides = [
            { count: winCountX, getPos: (i: number) => ({ wx: b.x - b.w / 2 + (i + 0.5) * (b.w / winCountX), wz: b.z + b.d / 2 + 0.02, rotY: 0 }) },
            { count: winCountX, getPos: (i: number) => ({ wx: b.x - b.w / 2 + (i + 0.5) * (b.w / winCountX), wz: b.z - b.d / 2 - 0.02, rotY: Math.PI }) },
            { count: winCountZ, getPos: (i: number) => ({ wx: b.x - b.w / 2 - 0.02, wz: b.z - b.d / 2 + (i + 0.5) * (b.d / winCountZ), rotY: -Math.PI / 2 }) },
            { count: winCountZ, getPos: (i: number) => ({ wx: b.x + b.w / 2 + 0.02, wz: b.z - b.d / 2 + (i + 0.5) * (b.d / winCountZ), rotY: Math.PI / 2 }) },
          ];
          for (const side of sides) {
            for (let wi = 0; wi < side.count; wi++) {
              const { wx, wz, rotY } = side.getPos(wi);
              // Casement window: pair of smaller quads side by side
              const winW = 0.14;
              const winH = 0.2;
              const gap = 0.02;
              // Warm night glow color (yellow-orange instead of blue-white)
              const warmColor = new THREE.Color(0xffcc66);
              const winMat = new THREE.MeshStandardMaterial({
                color: 0x88aaff,
                emissive: warmColor,
                emissiveIntensity: 0.1,
                transparent: true,
                opacity: 0.25,
              });
              // Left casement
              const winL = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), winMat);
              // Right casement
              const winR = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), winMat);
              // Window frame (dark border around the pair)
              const frameMat = new THREE.MeshBasicMaterial({
                color: 0x3a3a4a,
                transparent: true,
                opacity: 0.4,
              });
              const frame = new THREE.Mesh(
                new THREE.PlaneGeometry(winW * 2 + gap + 0.04, winH + 0.04),
                frameMat
              );
              // Position: frame behind, casements on top
              const offset = 0.001;
              if (rotY === 0 || rotY === Math.PI) {
                winL.position.set(wx - winW / 2 - gap / 2, wy, wz + offset);
                winR.position.set(wx + winW / 2 + gap / 2, wy, wz + offset);
                frame.position.set(wx, wy, wz);
              } else {
                winL.position.set(wx + offset, wy, wz - winW / 2 - gap / 2);
                winR.position.set(wx + offset, wy, wz + winW / 2 + gap / 2);
                frame.position.set(wx, wy, wz);
              }
              // Sill: thin horizontal bar at bottom
              const sillMat = new THREE.MeshBasicMaterial({
                color: 0x4a4a5a,
                transparent: true,
                opacity: 0.3,
              });
              const sill = new THREE.Mesh(
                new THREE.PlaneGeometry(winW * 2 + gap + 0.08, 0.03),
                sillMat
              );
              if (rotY === 0 || rotY === Math.PI) {
                winL.rotation.y = rotY;
                winR.rotation.y = rotY;
                frame.rotation.y = rotY;
                sill.position.set(wx, wy - winH / 2 - 0.02, wz);
                sill.rotation.y = rotY;
              } else {
                winL.rotation.y = rotY;
                winR.rotation.y = rotY;
                frame.rotation.y = rotY;
                sill.position.set(wx, wy - winH / 2 - 0.02, wz);
                sill.rotation.y = rotY;
              }
              this.scene.add(frame);
              this.scene.add(winL);
              this.scene.add(winR);
              this.scene.add(sill);
              // Track extra window parts for cleanup
              this.windowExtraParts.push(frame, winR, sill);
              // Track all window meshes for glow (track left casement as representative)
              this.windowGlows.push({
                mesh: winL,
                baseEmissive: 0.1 + Math.random() * 0.3,
                x: b.x,
                z: b.z,
                buildingId: b.id,
              });
            }
          }
        }
      }
    }

    // Debris dots scattered on ground near buildings
    const debrisMat = new THREE.MeshBasicMaterial({
      color: 0x3a3a3a,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const b of state.buildings) {
      const debrisCount = 3 + Math.floor(Math.random() * 5);
      for (let di = 0; di < debrisCount; di++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = (Math.random() * 0.8 + 0.1);
        const dx = Math.cos(angle) * (b.w / 2 + dist);
        const dz = Math.sin(angle) * (b.d / 2 + dist);
        const r = 0.03 + Math.random() * 0.05;
        const dot = new THREE.Mesh(new THREE.CircleGeometry(r, 6), debrisMat);
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(b.x + dx, 0.03, b.z + dz);
        this.scene.add(dot);
        this.debrisDots.push(dot);
      }
    }

    // Border walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.9, metalness: 0.3 });
    const hw = state.map.width / 2;
    const hd = state.map.depth / 2;
    const addWall = (x: number, z: number, w: number, d: number, h: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, h / 2, z);
      m.receiveShadow = true;
      this.scene.add(m);
      this.wallMeshes.push(m);
    };
    addWall(0, -hd, state.map.width, 0.5, 0.8);
    addWall(0, hd, state.map.width, 0.5, 0.8);
    addWall(-hw, 0, 0.5, state.map.depth, 0.8);
    addWall(hw, 0, 0.5, state.map.depth, 0.8);
  }

  private clearMeshes(): void {
    const all = [...this.buildingMeshes, ...this.roadMeshes, ...this.parkMeshes, ...this.treeMeshes, ...this.wallMeshes, ...this.bloodDecals, ...this.specialBuildingLights, ...this.bushMeshes, ...this.debrisDots];
    for (const m of all) {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if ((m.material as THREE.Material)) (m.material as THREE.Material).dispose();
    }
    this.buildingMeshes = [];
    this.roadMeshes = [];
    this.parkMeshes = [];
    this.treeMeshes = [];
    this.wallMeshes = [];
    this.bloodDecals = [];
    this.specialBuildingLights = [];
    this.bushMeshes = [];
    this.debrisDots = [];

    for (const wg of this.windowGlows) {
      this.scene.remove(wg.mesh);
      wg.mesh.geometry.dispose();
      (wg.mesh.material as THREE.Material).dispose();
    }
    // Clean up extra window parts (frames, right casements, sills)
    for (const ep of this.windowExtraParts) {
      this.scene.remove(ep);
      ep.geometry.dispose();
      (ep.material as THREE.Material).dispose();
    }
    this.windowGlows = [];
    this.windowExtraParts = [];

    for (const m of this.roadMarkings) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.roadMarkings = [];

    for (const m of this.roadCurbLines) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.roadCurbLines = [];

    for (const m of this.crosswalkMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.crosswalkMeshes = [];

    for (const t of this.tracers) {
      this.scene.remove(t);
      t.geometry.dispose();
    }
    this.tracers = [];

    // Clear building labels
    for (const [bId, meshes] of this.buildingOccupantDots.entries()) {
      for (const m of meshes) {
        this.scene.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    }
    this.buildingOccupantDots.clear();

    // Clear corpses
    for (const g of this.corpseGroups) {
      this.scene.remove(g);
      g.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }
    this.corpseGroups = [];
    this.corpseTimers = [];
    this.previousAliveZombieIds.clear();
  }

  update(state: SimulationState, dt: number): void {
    const time = state.timeOfDay;
    const isNight = time > 0.65 || time < 0.08;

    // Smoother day/night transition using sinusoidal day factor
    // Maps timeOfDay (0-1) to a smooth 0-1-0 curve
    // Peak daylight at time=0.25, deepest night at time=0.75
    let dayFactor: number;
    // Use a smooth sine wave for lighting: peak at time 0.25, trough at 0.75
    const sunAngle2 = (time - 0.25) * Math.PI * 2;
    dayFactor = (Math.cos(sunAngle2) + 1) * 0.5; // 0 at night, 1 at noon
    dayFactor = Math.max(0.15, Math.min(1, dayFactor)); // Night is dim but visible

    // ─── Night overlay ───
    (this.nightOverlay.material as THREE.MeshBasicMaterial).opacity = (1 - dayFactor) * 0.15;

    // ─── Moon visibility ───
    this.moon.visible = isNight && dayFactor < 0.4;
    if (this.moon.visible) {
      (this.moon.material as THREE.MeshBasicMaterial).opacity = (1 - dayFactor) * 0.6;
      const moonChildren = this.moon.children;
      for (const child of moonChildren) {
        if (child instanceof THREE.Mesh) {
          (child.material as THREE.MeshBasicMaterial).opacity = (1 - dayFactor) * 0.15;
        }
      }
    }

    // ─── Sky color — smooth gradient using dayFactor ───
    // Day: blue (0x6a8aba), sunset: orange, night: deep blue-black
    const dayColor = new THREE.Color(0x6a8aba);
    const sunsetColor = new THREE.Color(0xd47a3a);
    const nightColor = new THREE.Color(0x05051a);
    
    let skyColor: THREE.Color;
    if (dayFactor > 0.6) {
      // Full day
      skyColor = dayColor;
    } else if (dayFactor > 0.3) {
      // Transition between day and sunset/sunrise
      const t = (dayFactor - 0.3) / 0.3;
      skyColor = sunsetColor.clone().lerp(dayColor, t);
    } else {
      // Transition between night and sunset
      const t = dayFactor / 0.3;
      skyColor = nightColor.clone().lerp(sunsetColor, t);
    }
    (this.sky.material as THREE.MeshBasicMaterial).color.lerp(skyColor, 0.03);

    // ─── Dynamic ambient based on camera height ───
    // When camera is high (zoomed out), boost ambient so city stays visible
    const camHeight = this.camera.position.length();
    const heightBoost = Math.max(0, (camHeight - 20) / 60); // 0 at 20 units, 1 at 80 units
    this.ambient.intensity = 0.5 + dayFactor * 0.4 + heightBoost * 0.5;

    // ─── Sun movement ───
    const sunAngle = time * Math.PI * 2;
    this.directional.position.set(Math.cos(sunAngle) * 50, 20 + Math.sin(sunAngle) * 25, Math.sin(sunAngle) * 40);
    this.directional.intensity = dayFactor * 2.0 + 0.1 + heightBoost * 0.4;

    // ─── Fog — dynamic: less fog when zoomed out, more at night ───
    // When camera is high, reduce fog so city is visible
    const fogBase = Math.max(0.004, 0.008 - heightBoost * 0.006);
    const fogNight = (1 - dayFactor) * 0.008;
    const fogChaos = state.stats.zombies > 100 ? 0.003 : 0;
    (this.scene.fog as THREE.FogExp2).density = fogBase + fogNight + fogChaos;

    // ─── Building window glow at night + occupancy ───
    // Track which civilians are inside which buildings for visual effect
    const buildingOccupants = new Map<number, number>();
    for (const e of state.entities) {
      if (e.type === 'civilian' && e.state !== 'dead' && e.buildingId !== null) {
        buildingOccupants.set(e.buildingId, (buildingOccupants.get(e.buildingId) || 0) + 1);
      }
    }

    for (const wg of this.windowGlows) {
      const mat = wg.mesh.material as THREE.MeshStandardMaterial;
      const nightBrightness = (1 - dayFactor);
      // Occupancy bonus: buildings with occupants have brighter windows
      const occupantCount = buildingOccupants.get(wg.buildingId) || 0;
      const occBonus = occupantCount > 0 ? Math.min(0.8, occupantCount * 0.05) : 0;
      // Flicker with more chaos when occupied
      const flicker = Math.sin(state.totalTime * 3 + wg.x * 0.1 + wg.z * 0.1) * 0.1 +
        (occupantCount > 0 ? Math.sin(state.totalTime * 6 + wg.buildingId) * 0.15 : 0);
      mat.emissiveIntensity = wg.baseEmissive * (0.2 + nightBrightness * 0.8 + occBonus) + Math.max(0, flicker);
      mat.opacity = 0.2 + nightBrightness * 0.5 + occBonus * 0.3;
    }

    // ─── Building occupant count labels (roof counters) ───
    this.updateOccupantDots(buildingOccupants, state);

    // ─── Police lights flashing ───
    for (let i = 0; i < this.specialBuildingLights.length; i++) {
      const mat = this.specialBuildingLights[i].material as THREE.MeshStandardMaterial;
      const flash = Math.sin(state.totalTime * 4 + i * 2.5) > 0 ? 1 : 0.1;
      mat.emissiveIntensity = flash * 0.5 * (0.5 + (1 - dayFactor) * 0.5);
    }

    // ─── Update entities ───
    this.updateEntityMeshes(state, dayFactor, state.totalTime);

    // ─── Update particles ───
    this.updateParticles(dt);

    // ─── Blood decal cleanup ───
    if (this.bloodDecals.length > 100) {
      const old = this.bloodDecals.shift();
      if (old) {
        this.scene.remove(old);
        old.geometry.dispose();
        (old.material as THREE.Material).dispose();
      }
    }

    // ─── Update corpse timers, fade opacity, remove expired ───
    for (let i = this.corpseGroups.length - 1; i >= 0; i--) {
      this.corpseTimers[i] -= dt;
      const lifeFrac = Math.max(0, this.corpseTimers[i] / 20);
      if (lifeFrac <= 0) {
        const group = this.corpseGroups[i];
        this.scene.remove(group);
        group.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
        this.corpseGroups.splice(i, 1);
        this.corpseTimers.splice(i, 1);
      } else {
        // Fade opacity — stay opaque for first 70%, then fade
        const mesh = this.corpseGroups[i];
        const fadeStart = 0.3;
        const opacity = lifeFrac > fadeStart ? 1 : lifeFrac / fadeStart;
        const baseOp = (mesh.userData.baseOpacity as number) || 1;
        (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, opacity * baseOp);
        // Scale down as it decays
        const decayScale = 0.7 + lifeFrac * 0.3;
        mesh.scale.set(decayScale, decayScale, decayScale);
      }
    }

    // ─── Handle shot events (only NEW events since last frame) ───
    const events = state.events;
    for (let i = this.lastProcessedEvents; i < events.length; i++) {
      const ev = events[i];
      if (ev.text.startsWith('SHOT:')) {
        const payload = ev.text.slice(5);
        const colonIdx = payload.indexOf(':');
        if (colonIdx > 0) {
          const hit = payload.slice(0, colonIdx) === 'HIT';
          const parts = payload.slice(colonIdx + 1).split(',').map(Number);
          if (parts.length === 4) {
            this.spawnTracer(parts[0], parts[1], parts[2], parts[3], hit);
          }
        }
      } else if (ev.text.startsWith('CORPSE:')) {
        const parts = ev.text.slice(7).split(',').map(Number);
        if (parts.length === 2) {
          this.createCorpse(parts[0], parts[1]);
        }
      } else if (ev.text.startsWith('ALERT_RING:')) {
        const parts = ev.text.slice(11).split(',').map(Number);
        if (parts.length === 3) {
          this.spawnAlertRing(parts[0], parts[1], parts[2]);
        }
      } else if (ev.text.startsWith('DEPLOY:')) {
        const parts = ev.text.slice(7).split(',').map(Number);
        if (parts.length === 3) {
          this.spawnDeployEffect(parts[0], parts[1], parts[2]);
        }
      } else if (ev.text.startsWith('BREACH_FIRE:')) {
        const parts = ev.text.slice(12).split(',').map(Number);
        if (parts.length === 2) {
          this.spawnBreachFire(parts[0], parts[1]);
        }
      } else if (ev.text.startsWith('HORDE_SURGE:')) {
        const parts = ev.text.slice(12).split(',').map(Number);
        if (parts.length === 3) {
          this.spawnHordeSurge(parts[0], parts[1], parts[2]);
        }
      } else if (ev.text.startsWith('FIRE_START:')) {
        const parts = ev.text.slice(11).split(',').map(Number);
        if (parts.length === 2) {
          // Check if this fire is already tracked
          const existing = this.buildingFires.find(f => Math.abs(f.x - parts[0]) < 0.1 && Math.abs(f.z - parts[1]) < 0.1);
          if (!existing) {
            this.buildingFires.push({ x: parts[0], z: parts[1], buildingId: this.buildingFires.length, timeLeft: 60 });
          }
        }
      } else if (ev.text.startsWith('FIRE_STOP:')) {
        const parts = ev.text.slice(10).split(',').map(Number);
        if (parts.length === 2) {
          this.buildingFires = this.buildingFires.filter(f => !(Math.abs(f.x - parts[0]) < 0.1 && Math.abs(f.z - parts[1]) < 0.1));
        }
      } else if (ev.text.startsWith('HELICOPTER:')) {
        const parts = ev.text.slice(11).split(',').map(Number);
        if (parts.length === 4) {
          this.startHelicopterFlyover(parts[0], parts[1], parts[2], parts[3]);
        }
      } else if (ev.text.startsWith('BUILDING_DESTROYED:')) {
        const bId = parseInt(ev.text.slice(18), 10);
        // Find and replace the building mesh with rubble
        const b = state.buildings.find(bd => bd.id === bId);
        if (b) {
          // Find and remove meshes for this building (they're stored in this.buildingMeshes)
          const toRemove: THREE.Mesh[] = [];
          const toKeep: THREE.Mesh[] = [];
          for (const m of this.buildingMeshes) {
            if (m.userData.buildingId === bId) {
              toRemove.push(m);
            } else {
              toKeep.push(m);
            }
          }
          for (const m of toRemove) {
            this.scene.remove(m);
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
          this.buildingMeshes = toKeep;
          // Add rubble
          const rubbleMat = new THREE.MeshStandardMaterial({
            color: 0x555555,
            roughness: 1.0,
            metalness: 0.0,
          });
          const rubble = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.8, 0.3, b.d * 0.8), rubbleMat);
          rubble.position.set(b.x, 0.15, b.z);
          rubble.castShadow = true;
          rubble.receiveShadow = true;
          this.scene.add(rubble);
          this.buildingMeshes.push(rubble);
          // Clean up occupant dots for this building
          const occDots = this.buildingOccupantDots.get(bId);
          if (occDots) {
            for (const m of occDots) {
              this.scene.remove(m);
              m.geometry.dispose();
              (m.material as THREE.Material).dispose();
            }
            this.buildingOccupantDots.delete(bId);
          }
          // Also remove related window glows and extra parts for this building
          const wgToRemove: typeof this.windowGlows = [];
          for (const wg of this.windowGlows) {
            if (wg.buildingId === bId) {
              this.scene.remove(wg.mesh);
              wg.mesh.geometry.dispose();
              (wg.mesh.material as THREE.Material).dispose();
              wgToRemove.push(wg);
            }
          }
          this.windowGlows = this.windowGlows.filter(wg => wg.buildingId !== bId);
          // Debris cleanup at position
          this.spawnParticleBurst(b.x, b.z, 0x888888, 15);
          this.spawnParticleBurst(b.x, b.z, 0x555555, 10);
        }
      }
    }
    this.lastProcessedEvents = events.length;

    // ─── Helicopter trail particles ───
    if (this.helicopterActive) {
      this.updateHelicopterVisual(dt);
    }

    // ─── Continuous building fire particles ───
    for (const fire of this.buildingFires) {
      fire.timeLeft -= dt;
      if (fire.timeLeft > 0) {
        // Continuous fire/smoke particles
        this.spawnParticleBurst(fire.x, fire.z, 0xff4400, 2);
        this.spawnParticleBurst(fire.x, fire.z, 0x888800, 1);
        this.spawnParticleBurst(fire.x + (Math.random() - 0.5) * 2, fire.z + (Math.random() - 0.5) * 2, 0x333333, 1);
      }
    }

    // ─── Update supply crates ───
    this.updateSupplyCrates(state);

    // ─── Update alert rings ───
    this.updateAlertRings(dt);

    // ─── Update horde surges ───
    this.updateHordeSurges(dt);

    // ─── Update tracers ───
    this.updateTracers(dt);

    // ─── Controls ───
    this.controls.update();

    // ─── Render via composer ───
    this.composer.render();
  }

  private updateOccupantDots(buildingOccupants: Map<number, number>, state: SimulationState): void {
    // Remove dots for buildings no longer occupied
    for (const [bId, meshes] of this.buildingOccupantDots.entries()) {
      if (!buildingOccupants.has(bId)) {
        for (const m of meshes) {
          this.scene.remove(m);
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
        this.buildingOccupantDots.delete(bId);
      }
    }

    // Use cached occupantDotGeom instead of creating a new geometry each frame

    for (const [bId, count] of buildingOccupants.entries()) {
      if (count <= 0) continue;
      const b = state.buildings.find(b => b.id === bId);
      if (!b) continue;

      const dotCount = Math.min(count, 9);
      const cols = 3;  // Fixed 3x3 grid
      const rows = 3;
      const spacing = 0.5;

      // Remove old dots for this building
      const oldDots = this.buildingOccupantDots.get(bId);
      if (oldDots) {
        for (const m of oldDots) {
          this.scene.remove(m);
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      }

      // Create fresh dots every time — bigger, brighter, more visible
      const dots: THREE.Mesh[] = [];
      const startX = -((cols - 1) * spacing) / 2;
      const startZ = -((rows - 1) * spacing) / 2;

      for (let i = 0; i < dotCount; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const dot = new THREE.Mesh(this.occupantDotGeom.clone(), mat);
        dot.position.set(b.x + startX + col * spacing, b.h + 0.1, b.z + startZ + row * spacing);
        dot.rotation.x = -Math.PI / 2;
        this.scene.add(dot);
        dots.push(dot);
      }

      // Add a count label sprite above the building
      const countCanvas = document.createElement('canvas');
      countCanvas.width = 128;
      countCanvas.height = 64;
      const ctx = countCanvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${count}`, 64, 34);
      const tex = new THREE.CanvasTexture(countCanvas);
      const labelMat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true,
      });
      const label = new THREE.Sprite(labelMat);
      label.position.set(b.x, b.h + 1.5, b.z);
      label.scale.set(1.5, 0.75, 1);
      label.userData.isOccupantLabel = true;
      this.scene.add(label);
      dots.push(label as unknown as THREE.Mesh);

      this.buildingOccupantDots.set(bId, dots);
    }
  }

  private updateEntityMeshes(state: SimulationState, dayFactor: number, time: number): void {
    const currentIds = new Set<number>();
    const toRender = state.entities.filter(e => e.state !== 'dead');

    for (const e of toRender) {
      currentIds.add(e.id);
      let group = this.entityMeshes.get(e.id);
      if (!group || group.userData.entityType !== e.type) {
        // Remove old mesh if type changed (e.g., civilian turned zombie)
        if (group) {
          this.scene.remove(group);
          group.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          });
          this.entityMeshes.delete(e.id);
        }
        group = this.createEntityMesh(e);
        this.scene.add(group);
        this.entityMeshes.set(e.id, group);
      }

      group.position.set(e.x, 0, e.z);

      // ─── Starving civilian shake/vibration ───
      if (e.type === 'civilian' && e.state === 'starving') {
        const shakeIntensity = 0.03;
        const shakeX = Math.sin(time * 15 + e.id * 7) * shakeIntensity;
        const shakeZ = Math.cos(time * 13 + e.id * 11) * shakeIntensity;
        group.position.x += shakeX;
        group.position.z += shakeZ;
      }

      const col = new THREE.Color(e.color);

      // ─── Turn timer color interpolation (blue → green) + green mist particles ───
      if (e.type === 'civilian' && e.turnTimer > 0) {
        const timerFrac = Math.max(0, Math.min(1, e.turnTimer / 10.0));
        const startColor = new THREE.Color(0x4499ff);
        const endColor = new THREE.Color(0x33ff33);
        col.lerpColors(startColor, endColor, 1 - timerFrac);
        // Emit a small green mist particle each frame while turning
        this.emitInfectionParticle(e.x, e.z, timerFrac);
      }

        // Update sphere colors and state indicators
      group.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.color.copy(col);

          // ─── Civilian sleeping: dimmer ───
          if (e.isAsleep && e.type === 'civilian') {
            mat.emissiveIntensity = 0.02;
            mat.opacity = 0.6;
            mat.transparent = true;
          } else {
            mat.transparent = false;
            mat.opacity = 1.0;

            // ─── Zombie pulsing green glow ───
            if (e.type === 'zombie') {
              const glow = 0.5 + Math.sin(time * 2.5 + e.id * 0.7) * 0.4;
              mat.emissive.setHex(0x44ff44);
              mat.emissiveIntensity = glow;
              group.scale.set(
                1 + Math.sin(time * 1.5 + e.id) * 0.04,
                1 + Math.sin(time * 1.5 + e.id) * 0.04,
                1 + Math.sin(time * 1.5 + e.id) * 0.04
              );
              group.rotation.y += 0.3 * (1/60);
            } else if (e.type === 'military') {
              // Red emissive for military
              mat.emissive.setHex(0xff3333);
              mat.emissiveIntensity = 0.2;
              // Aiming: bright yellow pulse
              if (e.isAiming) {
                const aimPulse = 0.5 + Math.sin(time * 8 + e.id * 2) * 0.4;
                mat.emissiveIntensity = aimPulse;
                mat.emissive.setHex(0xffaa00);
              }
            } else if (e.type === 'civilian') {
              // ─── Turn timer: increasing pulse speed as conversion nears ───
              if (e.turnTimer > 0) {
                const timerFrac = Math.max(0, Math.min(1, e.turnTimer / 4.0));
                // Pulse speeds up as timer decreases (inverse relationship)
                const pulseFreq = 3 + (1 - timerFrac) * 12; // 3 Hz at start, 15 Hz near end
                const glowIntensity = 0.2 + (1 - timerFrac) * 1.5;
                const pulse = glowIntensity * (0.6 + Math.sin(time * pulseFreq + e.id * 2) * 0.4);
                mat.emissive.setHex(0x33ff33);
                mat.emissiveIntensity = Math.max(0.1, pulse);
              } else {
                mat.emissive.setHex(0x4499ff);
                mat.emissiveIntensity = 0.15;
              }
            }
          }
        }

        // ─── Sprite-based indicators ───
        if (child instanceof THREE.Sprite) {
          // Hero star — golden ★ for longest-surviving civilian
          if (child.userData.isHeroStar) {
            const isHero = e.type === 'civilian' && state.heroId === e.id;
            child.visible = isHero;
            if (isHero) {
              const heroMat = child.material as THREE.SpriteMaterial;
              heroMat.opacity = 0.8 + Math.sin(time * 3 + e.id) * 0.2;
              const pulseScale = 0.5 + Math.sin(time * 4 + e.id * 2) * 0.05;
              child.scale.set(pulseScale, pulseScale, 1);
            }
          } else if (child.userData.isAlphaCrown) {
            const isAlpha = e.type === 'zombie' && state.alphaId === e.id;
            child.visible = isAlpha;
            if (isAlpha) {
              const alphaMat = child.material as THREE.SpriteMaterial;
              alphaMat.opacity = 0.7 + Math.sin(time * 2.5 + e.id) * 0.3;
              const pulseScale = 0.5 + Math.sin(time * 3 + e.id * 1.5) * 0.05;
              child.scale.set(pulseScale, pulseScale, 1);
            }
          } else if (child.userData.isStarvingBang) {
            const isStarving = e.state === 'starving';
            child.visible = isStarving;
            if (isStarving) {
              const bangMat = child.material as THREE.SpriteMaterial;
              bangMat.opacity = 0.5 + Math.sin(time * 5 + e.id * 2) * 0.4;
              const pulseScale = 0.8 + Math.sin(time * 6 + e.id * 3) * 0.15;
              child.scale.set(pulseScale * 0.35, pulseScale * 0.35, 1);
            }
          } else if (child.userData.isTurningSkull) {
            // ☠ Skull appears above turning civilians
            const isTurning = e.type === 'civilian' && e.turnTimer > 0;
            child.visible = isTurning;
            if (isTurning) {
              const timerFrac = Math.max(0, Math.min(1, e.turnTimer / 4.0));
              const skullMat = child.material as THREE.SpriteMaterial;
              // Flash faster as conversion nears
              const flashSpeed = 4 + (1 - timerFrac) * 8;
              const flashAlpha = 0.4 + Math.sin(time * flashSpeed + e.id * 1.3) * 0.5;
              skullMat.opacity = Math.max(0.1, flashAlpha);
              // Scale up as conversion nears (urgency)
              const urgencyScale = 0.8 + (1 - timerFrac) * 0.5;
              const scale = 0.45 * urgencyScale;
              child.scale.set(scale, scale, 1);
              // Color shift from red to purple as conversion nears
              const c = new THREE.Color(0xff4444).lerp(new THREE.Color(0xaa00ff), 1 - timerFrac);
              skullMat.color.copy(c);
            }
          } else if (child.userData.isNoAmmo) {
            const isOut = e.ammoInMag <= 0 && e.ammo <= 0;
            child.visible = isOut;
            if (isOut) {
              const warnMat = child.material as THREE.SpriteMaterial;
              warnMat.opacity = 0.3 + Math.sin(time * 5 + e.id) * 0.25;
              const warnPulse = 0.9 + Math.sin(time * 5 + e.id) * 0.1;
              child.scale.set(warnPulse * 0.35, warnPulse * 0.35, 1);
            }
          }
        }
      });
    }

    // Remove dead entity meshes — detect zombie deaths and create corpses
    for (const [id, group] of this.entityMeshes.entries()) {
      if (!currentIds.has(id)) {
        const entityType = group.userData.entityType;
        // Create a corpse if this was a zombie that died
        if (entityType === 'zombie') {
          this.createCorpse(group.position.x, group.position.z);
        }
        this.scene.remove(group);
        group.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
        this.entityMeshes.delete(id);
      }
    }
  }

  private createEntityMesh(e: Entity): THREE.Group {
    const group = new THREE.Group();
    group.userData.entityType = e.type;
    group.userData.entityId = e.id;
    const col = new THREE.Color(e.color);

    if (e.type === 'civilian') {
      // Simple blue sphere with slight emissive
      const bodyMat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.3,
        metalness: 0.1,
        emissive: col,
        emissiveIntensity: 0.15,
      });
      const body = new THREE.Mesh(this.civilianGeom, bodyMat);
      body.position.y = 0.2;
      body.castShadow = true;
      body.userData.isBody = true;
      group.add(body);

      // ☠ Skull sprite for turning civilians (bitten, turnTimer > 0)
      const skullCanvas = document.createElement('canvas');
      skullCanvas.width = 64;
      skullCanvas.height = 64;
      const skullCtx = skullCanvas.getContext('2d')!;
      skullCtx.fillStyle = '#aa00ff';
      skullCtx.beginPath();
      skullCtx.arc(32, 32, 28, 0, Math.PI * 2);
      skullCtx.fill();
      skullCtx.fillStyle = '#ffffff';
      skullCtx.font = 'bold 28px sans-serif';
      skullCtx.textAlign = 'center';
      skullCtx.textBaseline = 'middle';
      skullCtx.fillText('☠', 32, 34);
      const skullTex = new THREE.CanvasTexture(skullCanvas);
      const skullMat = new THREE.SpriteMaterial({
        map: skullTex,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true,
        opacity: 0,
      });
      const skullSprite = new THREE.Sprite(skullMat);
      skullSprite.position.set(0, 0.65, 0);
      skullSprite.scale.set(0.5, 0.5, 1);
      skullSprite.userData.isTurningSkull = true;
      group.add(skullSprite);

      // Pulsing red "!" sprite for starving civilians
      const bangCanvas = document.createElement('canvas');
      bangCanvas.width = 64;
      bangCanvas.height = 64;
      const bangCtx = bangCanvas.getContext('2d')!;
      bangCtx.fillStyle = '#ff0000';
      bangCtx.beginPath();
      bangCtx.arc(32, 32, 28, 0, Math.PI * 2);
      bangCtx.fill();
      bangCtx.fillStyle = '#ffffff';
      bangCtx.font = 'bold 24px sans-serif';
      bangCtx.textAlign = 'center';
      bangCtx.textBaseline = 'middle';
      bangCtx.fillText('!', 32, 33);
      const bangTex = new THREE.CanvasTexture(bangCanvas);
      const bangMat = new THREE.SpriteMaterial({
        map: bangTex,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true,
        opacity: 0,
      });
      const bangSprite = new THREE.Sprite(bangMat);
      bangSprite.position.set(0, 0.45, 0);
      bangSprite.scale.set(0.35, 0.35, 1);
      bangSprite.userData.isStarvingBang = true;
      bangSprite.userData.isStarving = true;
      group.add(bangSprite);

      // ⭐ Golden star sprite for hero civilian
      const starCanvas = document.createElement('canvas');
      starCanvas.width = 64;
      starCanvas.height = 64;
      const starCtx = starCanvas.getContext('2d')!;
      starCtx.fillStyle = 'rgba(0,0,0,0)';
      starCtx.fillRect(0, 0, 64, 64);
      starCtx.fillStyle = '#ffd700';
      starCtx.beginPath();
      starCtx.arc(32, 32, 28, 0, Math.PI * 2);
      starCtx.fill();
      starCtx.fillStyle = '#000000';
      starCtx.font = 'bold 30px sans-serif';
      starCtx.textAlign = 'center';
      starCtx.textBaseline = 'middle';
      starCtx.fillText('★', 32, 34);
      const starTex = new THREE.CanvasTexture(starCanvas);
      const starMat = new THREE.SpriteMaterial({
        map: starTex,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true,
        opacity: 0,
      });
      const starSprite = new THREE.Sprite(starMat);
      starSprite.position.set(0, 0.8, 0);
      starSprite.scale.set(0.5, 0.5, 1);
      starSprite.userData.isHeroStar = true;
      group.add(starSprite);

    } else if (e.type === 'zombie') {
      // Green sphere with strong emissive for bloom
      const bodyMat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.3,
        metalness: 0.1,
        emissive: new THREE.Color(0x44ff44),
        emissiveIntensity: 1.0,
      });
      const body = new THREE.Mesh(this.zombieGeom, bodyMat);
      body.position.y = 0.22;
      body.castShadow = true;
      body.userData.isBody = true;
      group.add(body);

      // 👑 Red crown sprite for alpha zombie
      const crownCanvas = document.createElement('canvas');
      crownCanvas.width = 64;
      crownCanvas.height = 64;
      const crownCtx = crownCanvas.getContext('2d')!;
      crownCtx.fillStyle = 'rgba(0,0,0,0)';
      crownCtx.fillRect(0, 0, 64, 64);
      crownCtx.fillStyle = '#cc0000';
      crownCtx.beginPath();
      crownCtx.arc(32, 32, 28, 0, Math.PI * 2);
      crownCtx.fill();
      crownCtx.fillStyle = '#ffffff';
      crownCtx.font = 'bold 28px sans-serif';
      crownCtx.textAlign = 'center';
      crownCtx.textBaseline = 'middle';
      crownCtx.fillText('👑', 32, 34);
      const crownTex = new THREE.CanvasTexture(crownCanvas);
      const crownMat = new THREE.SpriteMaterial({
        map: crownTex,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true,
        opacity: 0,
      });
      const crownSprite = new THREE.Sprite(crownMat);
      crownSprite.position.set(0, 0.8, 0);
      crownSprite.scale.set(0.5, 0.5, 1);
      crownSprite.userData.isAlphaCrown = true;
      group.add(crownSprite);

    } else if (e.type === 'military') {
      // Red sphere with slight emissive
      const bodyMat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.4,
        metalness: 0.2,
        emissive: col,
        emissiveIntensity: 0.2,
      });
      const body = new THREE.Mesh(this.militaryGeom, bodyMat);
      body.position.y = 0.23;
      body.castShadow = true;
      body.userData.isBody = true;
      group.add(body);

      // Yellow "⚠" sprite for out-of-ammo military
      const warnCanvas = document.createElement('canvas');
      warnCanvas.width = 64;
      warnCanvas.height = 64;
      const warnCtx = warnCanvas.getContext('2d')!;
      warnCtx.fillStyle = '#ffcc00';
      warnCtx.beginPath();
      warnCtx.arc(32, 32, 28, 0, Math.PI * 2);
      warnCtx.fill();
      warnCtx.fillStyle = '#000000';
      warnCtx.font = 'bold 26px sans-serif';
      warnCtx.textAlign = 'center';
      warnCtx.textBaseline = 'middle';
      warnCtx.fillText('⚠', 32, 34);
      const warnTex = new THREE.CanvasTexture(warnCanvas);
      const warnMat = new THREE.SpriteMaterial({
        map: warnTex,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true,
        opacity: 0,
      });
      const warnSprite = new THREE.Sprite(warnMat);
      warnSprite.position.set(0, 0.5, 0);
      warnSprite.scale.set(0.35, 0.35, 1);
      warnSprite.userData.isNoAmmo = true;
      group.add(warnSprite);
    }

    return group;
  }

  private updateParticles(dt: number): void {
    const pos = this.particlePositions;
    const col = this.particleColors;
    const sizes = this.particleSizes;

    for (let i = 0; i < this.particleData.length; i++) {
      const pd = this.particleData[i];
      if (pd.life > 0) {
        pd.life -= dt;
        pos[i * 3] += pd.vx * dt;
        pos[i * 3 + 2] += pd.vz * dt;
        pos[i * 3 + 1] -= 0.8 * dt + Math.random() * 0.3;

        const lifeFrac = pd.life / pd.maxLife;
        col[i * 3] = pd.r * lifeFrac;
        col[i * 3 + 1] = pd.g * lifeFrac;
        col[i * 3 + 2] = pd.b * lifeFrac;
        sizes[i] = 0.2 + lifeFrac * 0.3;

        if (pd.life <= 0) {
          pos[i * 3 + 1] = -10;
          sizes[i] = 0;
        }
      }
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.particles.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.particles.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

    private updateTracers(dt: number): void {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      const mat = tracer.material as (THREE.LineBasicMaterial | THREE.LineDashedMaterial);
      mat.opacity -= dt * (tracer.userData.fadeRate || 3);
      if (mat.opacity <= 0) {
        this.scene.remove(tracer);
        tracer.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  spawnParticleBurst(x: number, z: number, color: number, count: number = 10): void {
    const col = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.particleIdx % this.particleData.length;
      this.particlePositions[idx * 3] = x + (Math.random() - 0.5) * 0.3;
      this.particlePositions[idx * 3 + 1] = 0.2 + Math.random() * 0.3;
      this.particlePositions[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
      this.particleData[idx] = {
        vx: (Math.random() - 0.5) * 4,
        vz: (Math.random() - 0.5) * 4,
        life: 0.5 + Math.random() * 1.2,
        maxLife: 1.5,
        r: col.r, g: col.g, b: col.b,
      };
      this.particleIdx++;
    }
  }

  private emitInfectionParticle(x: number, z: number, timerFrac: number): void {
    // Spawn 1-2 small green mist particles per frame around turning civilians
    // Rate increases as conversion nears (more particles when almost turned)
    const count = timerFrac < 0.3 ? 2 : 1;
    const col = new THREE.Color(0x33ff33);
    for (let p = 0; p < count; p++) {
      const idx = this.particleIdx % this.particleData.length;
      this.particlePositions[idx * 3] = x + (Math.random() - 0.5) * 0.6;
      this.particlePositions[idx * 3 + 1] = 0.3 + Math.random() * 0.4;
      this.particlePositions[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      this.particleData[idx] = {
        vx: (Math.random() - 0.5) * 0.8,
        vz: (Math.random() - 0.5) * 0.8,
        life: 0.8 + Math.random() * 1.0,
        maxLife: 1.5,
        r: col.r * 0.7,
        g: col.g,
        b: col.b * 0.4,
      };
      this.particleIdx++;
    }
  }

  spawnTracer(fromX: number, fromZ: number, toX: number, toZ: number, hit: boolean): void {
    let line: THREE.Line;
    if (hit) {
      // Solid bright red line for HIT — fade over 2 seconds
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xff2222,
        transparent: true,
        opacity: 1.0,
        linewidth: 2,
      });
      const points = [
        new THREE.Vector3(fromX, 0.4, fromZ),
        new THREE.Vector3(toX, 0.1, toZ),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      line = new THREE.Line(geom, lineMat);
      line.userData.fadeRate = 0.5; // fade over 2 seconds
      this.addBloodDecal(toX, toZ);
    } else {
      // Dashed lighter red line for MISS — fade over 1.5 seconds
      const lineMat = new THREE.LineDashedMaterial({
        color: 0xff8888,
        transparent: true,
        opacity: 1.0,
        dashSize: 0.5,
        gapSize: 0.3,
        linewidth: 1,
      });
      const points = [
        new THREE.Vector3(fromX, 0.4, fromZ),
        new THREE.Vector3(toX, 0.1, toZ),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      line = new THREE.Line(geom, lineMat);
      line.userData.fadeRate = 0.667; // fade over 1.5 seconds
      line.computeLineDistances();
    }
    this.scene.add(line);
    this.tracers.push(line);
  }

  addBloodDecal(x: number, z: number): void {
    if (this.decalCount > 150) return;
    this.decalCount++;

    const size = 0.1 + Math.random() * 0.2;
    const geom = new THREE.CircleGeometry(size, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.5 + Math.random() * 0.3, 0.0, 0.0),
      transparent: true,
      opacity: 0.4 + Math.random() * 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.05, z);
    this.scene.add(mesh);
    this.bloodDecals.push(mesh);
  }

  /**
   * Create a corpse blood pool at the position where a zombie died.
   * Clean dark red circle on ground that fades over time.
   */
  private createCorpse(x: number, z: number): void {
    const size = 0.2 + Math.random() * 0.15;
    const opacity = 0.5 + Math.random() * 0.3;
    const geom = new THREE.CircleGeometry(size, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.4 + Math.random() * 0.15, 0.0, 0.0),
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData.baseOpacity = opacity;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.03, z);

    // Slight random rotation
    mesh.rotation.z = Math.random() * Math.PI * 2;

    this.scene.add(mesh);
    this.corpseGroups.push(mesh);
    this.corpseTimers.push(18 + Math.random() * 4); // 18-22 seconds lifetime
  }

  private spawnAlertRing(x: number, z: number, radius: number): void {
    // Create a ring mesh at the alert point that will expand
    const mesh = new THREE.Mesh(this.ringGeom, this.ringMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.15, z);
    mesh.scale.set(0.01, 0.01, 0.01); // start tiny
    mesh.userData.ringX = x;
    mesh.userData.ringZ = z;
    this.scene.add(mesh);
    this.alertRings.push({
      mesh,
      maxRadius: radius,
      life: 1.2,
      maxLife: 1.2,
    });
  }

  private updateSupplyCrates(state: SimulationState): void {
    // Remove old supply crate meshes
    for (const m of this.supplyCrateMeshes) {
      this.scene.remove(m);
      if (m instanceof THREE.Mesh || m instanceof THREE.Line) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    }
    for (const m of this.supplyCrateGlows) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.supplyCrateMeshes = [];
    this.supplyCrateGlows = [];

    for (const crate of state.supplyCrates) {
      if (!crate.active) continue;

      // Parachute box - small cube
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0xcc8844,
        roughness: 0.6,
        metalness: 0.3,
        emissive: 0xcc8844,
        emissiveIntensity: 0.3,
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), boxMat);
      box.position.set(crate.x, 0.7, crate.z);
      box.castShadow = true;
      this.scene.add(box);
      this.supplyCrateMeshes.push(box);

      // Orange glow ring on ground
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff8800,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const glow = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.8, 16), glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(crate.x, 0.02, crate.z);
      this.scene.add(glow);
      this.supplyCrateGlows.push(glow);

      // Parachute lines (thin lines upward)
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.4,
      });
      // Four lines from box corners to a point above
      const topY = 2.5;
      const offsets = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
      for (const [ox, oz] of offsets) {
        const pts = [
          new THREE.Vector3(crate.x + ox, 0.5, crate.z + oz),
          new THREE.Vector3(crate.x, topY, crate.z),
        ];
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(g, lineMat);
        this.scene.add(line);
        this.supplyCrateMeshes.push(line);
      }

      // Parachute canopy (small dome)
      const canopyMat = new THREE.MeshBasicMaterial({
        color: 0xdddddd,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        canopyMat
      );
      canopy.position.set(crate.x, 2.5, crate.z);
      canopy.rotation.x = Math.PI;
      this.scene.add(canopy);
      this.supplyCrateGlows.push(canopy);
    }
  }

  private updateAlertRings(dt: number): void {
    for (let i = this.alertRings.length - 1; i >= 0; i--) {
      const ring = this.alertRings[i];
      ring.life -= dt;
      if (ring.life <= 0) {
        this.scene.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        (ring.mesh.material as THREE.Material).dispose();
        this.alertRings.splice(i, 1);
        continue;
      }
      // Expand: scale grows from 0 to maxRadius over the ring's lifetime
      const progress = 1 - ring.life / ring.maxLife;
      // Base ring outer radius is 0.08, so scale by maxRadius / 0.08 to reach full size
      const baseOuterRadius = 0.08;
      const scale = progress * (ring.maxRadius / baseOuterRadius);
      // Fade out over second half
      const fadeProgress = Math.max(0, (progress - 0.4) / 0.6);
      const mat = ring.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - fadeProgress) * 0.6;
      // Slight wobble / throb
      const wobbleScale = 1 + Math.sin(progress * Math.PI * 6) * 0.05;
      ring.mesh.scale.set(scale * wobbleScale, scale * wobbleScale, scale * wobbleScale);
    }
  }

  private spawnDeployEffect(x: number, z: number, count: number): void {
    // Dust/smoke particle burst (brown puffs)
    this.spawnParticleBurst(x, z, 0x8B7355, 15 + count * 5);
    // Also spawn a few white/grey smoke puffs
    this.spawnParticleBurst(x, z, 0xcccccc, 8 + count * 3);
    // For increased drama, spawn a second burst slightly offset
    this.spawnParticleBurst(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2, 0x6B5B45, 5);
  }

  private spawnBreachFire(x: number, z: number): void {
    // Smoke plume from breached building
    this.spawnParticleBurst(x, z, 0x444400, 20); // brown smoke
    this.spawnParticleBurst(x, z, 0x884400, 10); // orange embers
    this.spawnParticleBurst(x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3, 0x222222, 8); // dark smoke offset
    // Continuous smoke marker: spawn a static small dark cloud
    this.spawnParticleBurst(x, z, 0x333355, 5); // thin grey wisps
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FEATURE: HORDE SURGE SHOCKWAVE
  // ═══════════════════════════════════════════════════════════════════════════

  private spawnHordeSurge(x: number, z: number, radius: number): void {
    const mesh = new THREE.Mesh(this.hordeSurgeGeom, this.hordeSurgeMat.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.2, z);
    mesh.scale.set(0.01, 0.01, 0.01);
    this.scene.add(mesh);
    this.hordeSurges.push({
      mesh,
      maxRadius: radius,
      life: 2.0,
      maxLife: 2.0,
    });
    // Also emit dramatic red particles at the center
    this.spawnParticleBurst(x, z, 0xff0000, 15);
    this.spawnParticleBurst(x, z, 0xff4400, 10);
  }

  private updateHordeSurges(dt: number): void {
    for (let i = this.hordeSurges.length - 1; i >= 0; i--) {
      const surge = this.hordeSurges[i];
      surge.life -= dt;
      if (surge.life <= 0) {
        this.scene.remove(surge.mesh);
        surge.mesh.geometry.dispose();
        (surge.mesh.material as THREE.Material).dispose();
        this.hordeSurges.splice(i, 1);
        continue;
      }
      const progress = 1 - surge.life / surge.maxLife;
      const baseOuterRadius = 0.18;
      const scale = Math.min(progress * (surge.maxRadius / baseOuterRadius), surge.maxRadius / baseOuterRadius);
      // Fade out over last 40%
      const fadeProgress = Math.max(0, (progress - 0.6) / 0.4);
      const mat = surge.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - fadeProgress) * 0.8;
      // Throb effect
      const wobbleScale = 1 + Math.sin(progress * Math.PI * 8) * 0.1;
      surge.mesh.scale.set(scale * wobbleScale, scale * wobbleScale, scale * wobbleScale);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FEATURE: HELICOPTER FLYOVER
  // ═══════════════════════════════════════════════════════════════════════════

  private createHelicopter(): THREE.Group {
    const group = new THREE.Group();
    group.userData.isHelicopter = true;

    // Body: dark grey box
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.6, metalness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 0.4), bodyMat);
    body.castShadow = true;
    group.add(body);

    // Tail: thinner box behind
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.6, metalness: 0.4 });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.2), tailMat);
    tail.position.set(-0.5, 0, 0);
    group.add(tail);

    // Main rotor (horizontal blade)
    const rotorMat = new THREE.MeshBasicMaterial({ color: 0x555566, transparent: true, opacity: 0.6 });
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.08), rotorMat);
    rotor.position.set(0, 0.2, 0);
    rotor.userData.isRotor = true;
    group.add(rotor);

    // Cockpit window (small translucent blue)
    const cockpitMat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.4 });
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.2), cockpitMat);
    cockpit.position.set(0.35, 0.08, 0);
    group.add(cockpit);

    return group;
  }

  startHelicopterFlyover(sx: number, sz: number, ex: number, ez: number): void {
    if (!this.helicopterGroup) {
      this.helicopterGroup = this.createHelicopter();
      this.scene.add(this.helicopterGroup);

      // Shadow circle on ground
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.15,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.helicopterShadow = new THREE.Mesh(
        new THREE.CircleGeometry(2.5, 16),
        shadowMat
      );
      this.helicopterShadow.rotation.x = -Math.PI / 2;
      this.helicopterShadow.position.y = 0.05;
      this.scene.add(this.helicopterShadow);
    }

    this.helicopterActive = true;
    this.helicopterSx = sx;
    this.helicopterSz = sz;
    this.helicopterEx = ex;
    this.helicopterEz = ez;
    this.helicopterProgress = 0;
    this.helicopterFlightTime = 0;
  }

  private updateHelicopterVisual(dt: number): void {
    if (!this.helicopterGroup || !this.helicopterActive) {
      // Still visible but not flying - hide after timeout
      if (this.helicopterGroup && !this.helicopterActive) {
        this.helicopterTrailActive = false;
        this.helicopterGroup.visible = false;
        if (this.helicopterShadow) this.helicopterShadow.visible = false;
      }
      return;
    }

    this.helicopterFlightTime += dt;
    this.helicopterProgress = Math.min(1, this.helicopterFlightTime / 8);

    // Position
    this.helicopterX = this.helicopterSx + (this.helicopterEx - this.helicopterSx) * this.helicopterProgress;
    this.helicopterZ = this.helicopterSz + (this.helicopterEz - this.helicopterSz) * this.helicopterProgress;

    // Helicopter group position (flying at 4 units height)
    this.helicopterGroup.position.set(this.helicopterX, 4, this.helicopterZ);

    // Face flight direction
    const angle = Math.atan2(this.helicopterEz - this.helicopterSz, this.helicopterEx - this.helicopterSx);
    this.helicopterGroup.rotation.y = -angle + Math.PI / 2;

    // Gentle bobbing
    this.helicopterGroup.position.y += Math.sin(this.helicopterFlightTime * 4) * 0.1;

    // Rotor spinning
    for (const child of this.helicopterGroup.children) {
      if (child.userData.isRotor) {
        child.rotation.x += dt * 30;
      }
    }

    // Shadow
    if (this.helicopterShadow) {
      this.helicopterShadow.position.set(this.helicopterX, 0.05, this.helicopterZ);
      this.helicopterShadow.visible = true;
      // Shadow fades based on progress (stronger at start/end? No, just constant)
      (this.helicopterShadow.material as THREE.MeshBasicMaterial).opacity = 0.15;
    }

    // Particle trail behind helicopter
    if (this.helicopterFlightTime < 7.5) {
      // Spawn a few trail particles behind
      const trailMul = 0.3;
      const tx = this.helicopterSx + (this.helicopterEx - this.helicopterSx) * (this.helicopterProgress - 0.02 * trailMul);
      const tz = this.helicopterSz + (this.helicopterEz - this.helicopterSz) * (this.helicopterProgress - 0.02 * trailMul);
      this.spawnParticleBurst(tx, tz, 0x888899, 1);
      this.spawnParticleBurst(tx, tz, 0xaabbcc, 1);
    }

    // Complete
    if (this.helicopterProgress >= 1) {
      this.helicopterActive = false;
      this.helicopterGroup.visible = false;
      if (this.helicopterShadow) this.helicopterShadow.visible = false;
    }
  }

  reset(): void {
    for (const group of this.entityMeshes.values()) {
      this.scene.remove(group);
      group.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    }
    this.entityMeshes.clear();
    this.lastProcessedEvents = 0;

    this.clearMeshes();

    // Clear supply crate meshes
    for (const m of this.supplyCrateMeshes) {
      this.scene.remove(m);
      if (m instanceof THREE.Mesh || m instanceof THREE.Line) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    }
    this.supplyCrateMeshes = [];
    for (const m of this.supplyCrateGlows) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.supplyCrateGlows = [];

    const pos = this.particlePositions;
    for (let i = 0; i < this.particleData.length; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = -10;
      pos[i * 3 + 2] = 0;
      this.particleData[i] = { vx: 0, vz: 0, life: 0, maxLife: 0, r: 1, g: 1, b: 1 };
    }

    this.decalCount = 0;

    // Clear alert rings
    for (const ring of this.alertRings) {
      this.scene.remove(ring.mesh);
      ring.mesh.geometry.dispose();
      (ring.mesh.material as THREE.Material).dispose();
    }
    this.alertRings = [];

    // Clear horde surges
    for (const surge of this.hordeSurges) {
      this.scene.remove(surge.mesh);
      surge.mesh.geometry.dispose();
      (surge.mesh.material as THREE.Material).dispose();
    }
    this.hordeSurges = [];

    // Clear building fires
    this.buildingFires = [];

    // Clear helicopter
    if (this.helicopterGroup) {
      this.scene.remove(this.helicopterGroup);
      this.helicopterGroup.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      this.helicopterGroup = null;
    }
    if (this.helicopterShadow) {
      this.scene.remove(this.helicopterShadow);
      this.helicopterShadow.geometry.dispose();
      (this.helicopterShadow.material as THREE.Material).dispose();
      this.helicopterShadow = null;
    }
    this.helicopterActive = false;

    // Clear deploy drops
    for (const drop of this.deployDrops) {
      this.scene.remove(drop.mesh);
      drop.mesh.geometry.dispose();
      (drop.mesh.material as THREE.Material).dispose();
    }
    this.deployDrops = [];

    // Clear supply crate meshes
    for (const m of this.supplyCrateMeshes) {
      this.scene.remove(m);
      if (m instanceof THREE.Mesh || m instanceof THREE.Line) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    }
    this.supplyCrateMeshes = [];
    for (const m of this.supplyCrateGlows) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.supplyCrateGlows = [];
  }

  dispose(): void {
    this.renderer.dispose();
    this.composer.dispose();
    window.removeEventListener('resize', () => {});
  }
}
