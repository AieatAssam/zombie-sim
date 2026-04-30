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

  // Ambient dust particles
  private dustParticles: THREE.Points;
  private dustPositions: Float32Array;
  private dustVelocities: Float32Array;

  // Ember/ash particles
  private emberParticles: THREE.Points;
  private emberPositions: Float32Array;
  private emberVelocities: Float32Array;

  // Sky / atmosphere
  private sky: THREE.Mesh;
  private stars: THREE.Points;
  private starPositions: Float32Array;
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

  // Track last processed event index to avoid re-processing tracers
  private lastProcessedEvents = 0;

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

    // ─── Stars ───
    const starGeom = new THREE.BufferGeometry();
    this.starPositions = new Float32Array(3000 * 3);
    const starSizes = new Float32Array(3000);
    for (let i = 0; i < 3000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 85 + Math.random() * 5;
      this.starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      this.starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi));
      this.starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      starSizes[i] = 0.1 + Math.random() * 0.4;
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(this.starPositions, 3));
    starGeom.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
    this.stars = new THREE.Points(starGeom, new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.3,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
    }));
    this.scene.add(this.stars);

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
    this.occupantDotGeom = new THREE.PlaneGeometry(0.5, 0.5, 2, 2);

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

    // ─── Ambient dust particles ───
    const DUST_COUNT = 600;
    this.dustPositions = new Float32Array(DUST_COUNT * 3);
    this.dustVelocities = new Float32Array(DUST_COUNT * 3);
    const dustSizes = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      this.dustPositions[i * 3] = (Math.random() - 0.5) * 60;
      this.dustPositions[i * 3 + 1] = Math.random() * 10 + 1;
      this.dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
      this.dustVelocities[i * 3] = (Math.random() - 0.5) * 0.3;
      this.dustVelocities[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
      this.dustVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      dustSizes[i] = 0.12 + Math.random() * 0.25;
    }
    const dustGeom = new THREE.BufferGeometry();
    dustGeom.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    dustGeom.setAttribute('size', new THREE.BufferAttribute(dustSizes, 1));
    const dustMat = new THREE.PointsMaterial({
      color: 0xcceeff,
      size: 0.18,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.dustParticles = new THREE.Points(dustGeom, dustMat);
    this.scene.add(this.dustParticles);

    // ─── Ember/ash particles near buildings (orange, slowly rising) ───
    const EMBER_COUNT = 100;
    this.emberPositions = new Float32Array(EMBER_COUNT * 3);
    this.emberVelocities = new Float32Array(EMBER_COUNT * 3);
    const emberSizes = new Float32Array(EMBER_COUNT);
    for (let i = 0; i < EMBER_COUNT; i++) {
      this.emberPositions[i * 3] = (Math.random() - 0.5) * 50;
      this.emberPositions[i * 3 + 1] = Math.random() * 8 + 0.5;
      this.emberPositions[i * 3 + 2] = (Math.random() - 0.5) * 50;
      this.emberVelocities[i * 3] = (Math.random() - 0.5) * 0.15;
      this.emberVelocities[i * 3 + 1] = 0.2 + Math.random() * 0.3;
      this.emberVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
      emberSizes[i] = 0.04 + Math.random() * 0.08;
    }
    const emberGeom = new THREE.BufferGeometry();
    emberGeom.setAttribute('position', new THREE.BufferAttribute(this.emberPositions, 3));
    emberGeom.setAttribute('size', new THREE.BufferAttribute(emberSizes, 1));
    const emberMat = new THREE.PointsMaterial({
      color: 0xff6633,
      size: 0.1,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.emberParticles = new THREE.Points(emberGeom, emberMat);
    this.scene.add(this.emberParticles);

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

    // Day factor (0=night, 1=day)
    let dayFactor: number;
    if (time < 0.08) dayFactor = time / 0.08;
    else if (time < 0.35) dayFactor = 1;
    else if (time < 0.5) dayFactor = 1 - (time - 0.35) / 0.15;
    else if (time < 0.65) dayFactor = (time - 0.5) / 0.15;
    else dayFactor = 0;
    dayFactor = Math.max(0, Math.min(1, dayFactor));

    // ─── Night overlay ───
    (this.nightOverlay.material as THREE.MeshBasicMaterial).opacity = (1 - dayFactor) * 0.4;

    // ─── Stars visibility ───
    (this.stars.material as THREE.PointsMaterial).opacity = (1 - dayFactor) * 0.8;

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

    // ─── Sky color ───
    let skyColor: THREE.Color;
    if (dayFactor > 0.5) {
      skyColor = new THREE.Color(0x4a6a9a);
    } else if (time > 0.35 && time < 0.5) {
      const sunsetT = (time - 0.35) / 0.15;
      skyColor = new THREE.Color(1, 0.5 + 0.3 * (1 - sunsetT), 0.2 + 0.3 * (1 - sunsetT));
    } else if (time > 0.5 && time < 0.65) {
      const sunriseT = (time - 0.5) / 0.15;
      skyColor = new THREE.Color(1, 0.5 + 0.3 * sunriseT, 0.2 + 0.3 * sunriseT);
    } else {
      skyColor = new THREE.Color(0x05051a);
    }
    (this.sky.material as THREE.MeshBasicMaterial).color.lerp(skyColor, 0.05);

    // ─── Dynamic ambient based on camera height ───
    // When camera is high (zoomed out), boost ambient so city stays visible
    const camHeight = this.camera.position.length();
    const heightBoost = Math.max(0, (camHeight - 20) / 60); // 0 at 20 units, 1 at 80 units
    this.ambient.intensity = 0.3 + dayFactor * 0.5 + heightBoost * 0.6;

    // ─── Sun movement ───
    const sunAngle = time * Math.PI * 2;
    this.directional.position.set(Math.cos(sunAngle) * 50, 20 + Math.sin(sunAngle) * 25, Math.sin(sunAngle) * 40);
    this.directional.intensity = dayFactor * 2.0 + 0.3 + heightBoost * 0.3;

    // ─── Fog — dynamic: less fog when zoomed out, more at night ───
    // When camera is high, reduce fog so city is visible
    const fogBase = Math.max(0.004, 0.008 - heightBoost * 0.006);
    const fogNight = (1 - dayFactor) * 0.015;
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

    // ─── Update ambient dust ───
    this.updateDustParticles(dt, dayFactor);

    // ─── Update ember particles ───
    this.updateEmberParticles(dt, state);

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
      }
    }
    this.lastProcessedEvents = events.length;

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

      // Create fresh dots every time
      const dots: THREE.Mesh[] = [];
      const startX = -((cols - 1) * spacing) / 2;
      const startZ = -((rows - 1) * spacing) / 2;

      for (let i = 0; i < dotCount; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const brightness = 0.6 + (i / dotCount) * 0.4;
        const mat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(0.2, 0.5 + brightness * 0.4, 0.8),
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const dot = new THREE.Mesh(this.occupantDotGeom.clone(), mat);
        dot.position.set(b.x + startX + col * spacing, b.h + 0.1, b.z + startZ + row * spacing);
        dot.rotation.x = -Math.PI / 2;
        this.scene.add(dot);
        dots.push(dot);
      }
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
              mat.emissive.setHex(0x4499ff);
              mat.emissiveIntensity = 0.15;
            }
          }
        }

        // ─── Sprite-based indicators ───
        if (child instanceof THREE.Sprite) {
          if (child.userData.isStarvingBang) {
            const isStarving = e.state === 'starving';
            child.visible = isStarving;
            if (isStarving) {
              const bangMat = child.material as THREE.SpriteMaterial;
              bangMat.opacity = 0.5 + Math.sin(time * 5 + e.id * 2) * 0.4;
              const pulseScale = 0.8 + Math.sin(time * 6 + e.id * 3) * 0.15;
              child.scale.set(pulseScale * 0.35, pulseScale * 0.35, 1);
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

  private updateDustParticles(dt: number, dayFactor: number): void {
    const pos = this.dustPositions;
    const vel = this.dustVelocities;
    const dustMat = this.dustParticles.material as THREE.PointsMaterial;
    // More visible during day too — bring up min opacity
    dustMat.opacity = 0.12 + (1 - dayFactor) * 0.1;

    for (let i = 0; i < pos.length / 3; i++) {
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

      if (pos[i * 3] > 30) pos[i * 3] = -30;
      if (pos[i * 3] < -30) pos[i * 3] = 30;
      if (pos[i * 3 + 2] > 30) pos[i * 3 + 2] = -30;
      if (pos[i * 3 + 2] < -30) pos[i * 3 + 2] = 30;
      if (pos[i * 3 + 1] > 12) pos[i * 3 + 1] = 1;
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 10;
    }
    (this.dustParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateEmberParticles(dt: number, state: SimulationState): void {
    const pos = this.emberPositions;
    const vel = this.emberVelocities;
    const emberMat = this.emberParticles.material as THREE.PointsMaterial;
    const isNight = state.timeOfDay > 0.65 || state.timeOfDay < 0.08;
    emberMat.opacity = isNight ? 0.4 : 0.15;

    for (let i = 0; i < pos.length / 3; i++) {
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;

      // Slowly drift horizontally with gentle sine
      vel[i * 3] += Math.sin(state.totalTime * 0.5 + i) * 0.01 * dt;
      vel[i * 3 + 2] += Math.cos(state.totalTime * 0.5 + i * 0.7) * 0.01 * dt;

      if (pos[i * 3] > 25) pos[i * 3] = -25;
      if (pos[i * 3] < -25) pos[i * 3] = 25;
      if (pos[i * 3 + 2] > 25) pos[i * 3 + 2] = -25;
      if (pos[i * 3 + 2] < -25) pos[i * 3 + 2] = 25;
      if (pos[i * 3 + 1] > 10) { pos[i * 3 + 1] = 0.5; }
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 8 + Math.random() * 2;
    }
    (this.emberParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
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

    const pos = this.particlePositions;
    for (let i = 0; i < this.particleData.length; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = -10;
      pos[i * 3 + 2] = 0;
      this.particleData[i] = { vx: 0, vz: 0, life: 0, maxLife: 0, r: 1, g: 1, b: 1 };
    }

    this.decalCount = 0;
  }

  dispose(): void {
    this.renderer.dispose();
    this.composer.dispose();
    window.removeEventListener('resize', () => {});
  }
}
