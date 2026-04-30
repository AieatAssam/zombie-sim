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
  private roadMeshes: THREE.Mesh[] = [];
  private parkMeshes: THREE.Mesh[] = [];
  private treeMeshes: THREE.Mesh[] = [];
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

  // Screen shake
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimer = 0;
  private originalCamPos = new THREE.Vector3();

  // Starving civilians shake offset tracking
  private starvingShakeOffsets: Map<number, number> = new Map();
  private starvingExclamationSprites: Map<number, THREE.Sprite> = new Map();

  // Entity geometry caches
  private civilianGeom: THREE.BufferGeometry;
  private civilianHeadGeom: THREE.BufferGeometry;
  private zombieGeom: THREE.BufferGeometry;
  private militaryGeom: THREE.BufferGeometry;
  private antennaGeom: THREE.BufferGeometry;

  // Building light meshes at night
  private buildingWindowLights: { mesh: THREE.Mesh; x: number; z: number }[] = [];

  // Out-of-ammo indicator geometry cache
  private noAmmoIndicatorGeom: THREE.BufferGeometry;
  private starvingIndicatorGeom: THREE.BufferGeometry;

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
      0.5,   // strength
      0.4,   // radius
      0.05   // threshold
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
    const skyGeom = new THREE.SphereGeometry(120, 32, 32);
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
    const groundGeom = new THREE.PlaneGeometry(70, 70, 20, 20);
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
    this.gridHelper = new THREE.GridHelper(70, 50, 0x2a3a2a, 0x1a2a1a);
    this.gridHelper.position.y = 0.01;
    this.gridHelper.material.transparent = true;
    this.gridHelper.material.opacity = 0.2;
    this.scene.add(this.gridHelper);

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

    // ─── Entity geometry cache ───
    this.civilianGeom = new THREE.CylinderGeometry(0.25, 0.3, 0.7, 12, 3);
    this.civilianHeadGeom = new THREE.SphereGeometry(0.18, 12, 8);
    this.zombieGeom = new THREE.ConeGeometry(0.35, 0.75, 10);
    this.militaryGeom = new THREE.BoxGeometry(0.45, 0.6, 0.45, 2, 2, 2);
    this.antennaGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 3);
    this.noAmmoIndicatorGeom = new THREE.ConeGeometry(0.08, 0.12, 3);
    this.starvingIndicatorGeom = new THREE.ConeGeometry(0.15, 0.25, 6);
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
    const DUST_COUNT = 400;
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
      dustSizes[i] = 0.1 + Math.random() * 0.2;
    }
    const dustGeom = new THREE.BufferGeometry();
    dustGeom.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    dustGeom.setAttribute('size', new THREE.BufferAttribute(dustSizes, 1));
    const dustMat = new THREE.PointsMaterial({
      color: 0xaaaacc,
      size: 0.15,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.dustParticles = new THREE.Points(dustGeom, dustMat);
    this.scene.add(this.dustParticles);

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
      const geom = new THREE.PlaneGeometry(r.w * 0.95, r.d * 0.95, 4, 4);
      const mesh = new THREE.Mesh(geom, roadMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(r.x, 0.01, r.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.roadMeshes.push(mesh);
    }

    // Road center markings with higher detail
    const dashMat = new THREE.LineBasicMaterial({ color: 0xddddaa, transparent: true, opacity: 0.25 });
    for (const r of state.map.roads) {
      if (r.w > 2.8 || r.d > 2.8) {
        const isHorizontal = r.w > r.d;
        const len = isHorizontal ? r.w : r.d;
        const segments = Math.floor(len / 0.6);
        for (let s = 0; s < segments; s += 2) {
          const start = -len / 2 + s * 0.6;
          const end = start + 0.35;
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
          new THREE.CylinderGeometry(0.06, 0.12, 0.5 + Math.random() * 0.4, 4),
          new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 1 })
        );
        trunk.position.set(tx, 0.25, tz);
        trunk.castShadow = true;
        this.scene.add(trunk);
        this.treeMeshes.push(trunk);

        const crownH = 0.3 + Math.random() * 0.25;
        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(crownH, 6, 6),
          new THREE.MeshStandardMaterial({ color: 0x2d6a2e, roughness: 0.8 })
        );
        crown.position.set(tx, 0.6 + Math.random() * 0.3, tz);
        crown.castShadow = true;
        this.scene.add(crown);
        this.treeMeshes.push(crown);
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
      const geom = new THREE.BoxGeometry(b.w, b.h, b.d, 4, 4, 4);
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
        hospital: 0x8B4513,  // Brown — (no function)
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
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.95, b.d * 0.95, 4, 4), roofMat2);
      roof.rotation.x = -Math.PI / 2;
      roof.position.set(b.x, b.h + 0.05, b.z);
      this.scene.add(roof);
      this.buildingMeshes.push(roof);

      // Ground-contact shadow/glow at building base for ambient occlusion
      const contactMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.08,
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

        // Small glowing cube on top
        const beaconMat = new THREE.MeshStandardMaterial({
          color: 0xff0044,
          emissive: 0xff0044,
          emissiveIntensity: 1.5,
        });
        const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.25), beaconMat);
        beacon.position.set(b.x, b.h + 0.18, b.z);
        this.scene.add(beacon);
        this.specialBuildingLights.push(beacon);
      }


      // Windows with glow at night — 4 sides, more windows
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
              const winMat = new THREE.MeshStandardMaterial({
                color: 0x88aaff,
                emissive: 0x88ccff,
                emissiveIntensity: 0.1,
                transparent: true,
                opacity: 0.3,
              });
              const win = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.25), winMat);
              win.position.set(wx, wy, wz);
              win.rotation.y = rotY;
              this.scene.add(win);
              this.windowGlows.push({
                mesh: win,
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
    const all = [...this.buildingMeshes, ...this.roadMeshes, ...this.parkMeshes, ...this.treeMeshes, ...this.wallMeshes, ...this.bloodDecals, ...this.specialBuildingLights];
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

    for (const wg of this.windowGlows) {
      this.scene.remove(wg.mesh);
      wg.mesh.geometry.dispose();
      (wg.mesh.material as THREE.Material).dispose();
    }
    this.windowGlows = [];

    for (const m of this.roadMarkings) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.roadMarkings = [];

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

  /**
   * Trigger a screen shake
   */
  shake(intensity: number, duration: number): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
    this.originalCamPos.copy(this.camera.position);
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

    // ─── Screen shake ───
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const frac = this.shakeTimer / this.shakeDuration;
      const intensity = this.shakeIntensity * frac;
      this.camera.position.x = this.originalCamPos.x + (Math.random() - 0.5) * intensity;
      this.camera.position.y = this.originalCamPos.y + (Math.random() - 0.5) * intensity * 0.5;
      this.camera.position.z = this.originalCamPos.z + (Math.random() - 0.5) * intensity;
      this.controls.target.set(0, 0, 0);
      if (this.shakeTimer <= 0) {
        this.camera.position.copy(this.originalCamPos);
      }
    }

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

      // Update material colors and state indicators
      group.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;

          // ─── State indicator: starving (orange cone above head + red ! sprite) ───
          if (child.userData.isStarving) {
            if (e.state === 'starving') {
              child.visible = true;
              const mat2 = child.material as THREE.MeshStandardMaterial;
              mat2.emissiveIntensity = 0.5 + Math.sin(time * 4 + e.id * 3) * 0.3;
              mat2.opacity = 0.8;
              // Subtle pulsing orange glow on top of blue body
              const glowScale = 0.9 + Math.sin(time * 4 + e.id) * 0.1;
              child.scale.set(glowScale, glowScale, glowScale);
            } else {
              child.visible = false;
            }
          } else if (child.userData.isStarvingBang) {
            if (e.state === 'starving') {
              child.visible = true;
              const bangMat = child.material as THREE.SpriteMaterial;
              bangMat.opacity = 0.5 + Math.sin(time * 5 + e.id * 2) * 0.4;
              const pulseScale = 0.8 + Math.sin(time * 6 + e.id * 3) * 0.15;
              child.scale.set(pulseScale * 0.3, pulseScale * 0.3, 1);
            } else {
              child.visible = false;
            }
          } else if (child.userData.isBody || child.userData.isHead) {
            mat.color.copy(col);
            // Reset scale
            if (child.userData.isBody) {
              group.scale.set(1, 1, 1);
            }
          }

          if (child.userData.isBody || child.userData.isHead) {
            // ─── Civilian sleeping: dimmer ───
            if (e.isAsleep && e.type === 'civilian') {
              mat.emissiveIntensity = 0.02;
              mat.opacity = 0.6;
              mat.transparent = true;
            }

            // ─── Zombie pulsing glow ───
            if (e.type === 'zombie') {
              const pulse = 0.5 + Math.sin(time * 2.5 + e.id * 0.7) * 0.4;
              const glow = 0.5 + Math.sin(time * 2.5 + e.id * 0.7) * 0.3;
              if (child.userData.isBody) {
                mat.emissive.setHex(0x44ff44);
                mat.emissiveIntensity = glow;
              }
              group.scale.set(
                1 + Math.sin(time * 1.5 + e.id) * 0.04,
                1 + Math.sin(time * 1.5 + e.id) * 0.04,
                1 + Math.sin(time * 1.5 + e.id) * 0.04
              );
              group.rotation.y += 0.3 * (1/60);
            } else if (e.type === 'military') {
              // ─── Aiming indicator ───
              if (e.isAiming && child.userData.isBody) {
                // Pulsing yellow/orange when aiming
                const aimPulse = 0.5 + Math.sin(time * 8 + e.id * 2) * 0.4;
                mat.emissiveIntensity = aimPulse;
                mat.emissive.setHex(0xffaa00);
              } else if (child.userData.isBody) {
                // Normal military body glow
                mat.emissiveIntensity = 0.25;
                mat.emissive.setHex(0xff3333);
              }
              // ─── Antenna changes color when aiming ───
              if (e.isAiming && child.userData.isAntenna) {
                const aimPulse = 0.6 + Math.sin(time * 10 + e.id) * 0.4;
                mat.emissiveIntensity = aimPulse;
                mat.emissive.setHex(0xffaa00);
                mat.color.setHex(0xffcc44);
              } else if (child.userData.isAntenna) {
                mat.emissiveIntensity = 1.0;
                mat.emissive.setHex(0xff3333);
                mat.color.setHex(0xaaaaaa);
              }
            } else if (child.userData.isBody) {
              mat.emissiveIntensity = 0.05;
            }
          }

          // ─── Out-of-ammo indicator on military ───
          if (e.type === 'military' && child.userData.isNoAmmo) {
            const isOut = e.ammoInMag <= 0 && e.ammo <= 0;
            child.visible = isOut;
            if (isOut) {
              (child.material as THREE.MeshStandardMaterial).emissiveIntensity =
                0.3 + Math.sin(time * 5 + e.id) * 0.25;
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
      const bodyMat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.3,
        metalness: 0.1,
        emissive: col,
        emissiveIntensity: 0.15,
      });
      const body = new THREE.Mesh(this.civilianGeom, bodyMat);
      body.position.y = 0.25;
      body.castShadow = true;
      body.userData.isBody = true;
      group.add(body);

      const headMat = new THREE.MeshStandardMaterial({
        color: 0xffccaa,
        roughness: 0.5,
      });
      const head = new THREE.Mesh(this.civilianHeadGeom, headMat);
      head.position.y = 0.6;
      head.userData.isHead = true;
      group.add(head);

      // Starving indicator: small orange diamond above head (hidden by default)
      const starvingMat = new THREE.MeshStandardMaterial({
        color: 0xff6600,
        emissive: 0xff6600,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0,
      });
      const starvingMesh = new THREE.Mesh(this.starvingIndicatorGeom, starvingMat);
      starvingMesh.position.y = 0.85;
      starvingMesh.userData.isStarving = true;
      starvingMesh.visible = false;
      group.add(starvingMesh);

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
      bangSprite.position.set(0, 0.95, 0);
      bangSprite.scale.set(0.3, 0.3, 1);
      bangSprite.userData.isStarvingBang = true;
      group.add(bangSprite);

    } else if (e.type === 'zombie') {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.3,
        metalness: 0.2,
        emissive: new THREE.Color(0x44ff44),
        emissiveIntensity: 1.5,
      });
      const body = new THREE.Mesh(this.zombieGeom, bodyMat);
      body.position.y = 0.28;
      body.castShadow = true;
      body.userData.isBody = true;
      group.add(body);

      const headMat = new THREE.MeshStandardMaterial({
        color: 0x88aa44,
        emissive: 0x44ff44,
        emissiveIntensity: 0.5,
        roughness: 0.7,
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 5), headMat);
      head.position.y = 0.55;
      head.userData.isHead = true;
      group.add(head);

    } else if (e.type === 'military') {
      const bodyMat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.5,
        metalness: 0.3,
        emissive: col,
        emissiveIntensity: 0.15,
      });
      const body = new THREE.Mesh(this.militaryGeom, bodyMat);
      body.position.y = 0.22;
      body.castShadow = true;
      body.userData.isBody = true;
      group.add(body);

      const headMat = new THREE.MeshStandardMaterial({
        color: 0xccaa88,
        roughness: 0.5,
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 5), headMat);
      head.position.y = 0.5;
      head.userData.isHead = true;
      group.add(head);

      // Antenna with enhanced glow for visibility
      const antMat = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        emissive: 0xff3333,
        emissiveIntensity: 1.0,
        metalness: 0.5,
      });
      const ant = new THREE.Mesh(this.antennaGeom, antMat);
      ant.position.y = 0.65;
      ant.userData.isAntenna = true;
      group.add(ant);

      // Red dot on antenna tip — brighter
      const dotMat = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 1.5,
      });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), dotMat);
      dot.position.y = 0.75;
      dot.userData.isAntenna = true;
      group.add(dot);

      // ─── Out-of-ammo indicator: small red triangle above head ───
      const noAmmoMat = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.8,
      });
      const noAmmoMesh = new THREE.Mesh(this.noAmmoIndicatorGeom, noAmmoMat);
      noAmmoMesh.position.y = 0.9;
      noAmmoMesh.userData.isNoAmmo = true;
      group.add(noAmmoMesh);
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
    dustMat.opacity = 0.08 + (1 - dayFactor) * 0.1;

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
    this.shakeTimer = 0;
  }

  dispose(): void {
    this.renderer.dispose();
    this.composer.dispose();
    window.removeEventListener('resize', () => {});
  }
}
