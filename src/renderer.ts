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

  private entityMeshes: Map<number, THREE.Group> = new Map();
  private buildingMeshes: THREE.Mesh[] = [];
  private windowGlows: { mesh: THREE.Mesh; baseEmissive: number }[] = [];
  private roadMeshes: THREE.Mesh[] = [];
  private parkMeshes: THREE.Mesh[] = [];
  private treeMeshes: THREE.Mesh[] = [];
  private wallMeshes: THREE.Mesh[] = [];
  private specialBuildingLights: THREE.Mesh[] = [];

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

  // Zombie glow
  private glowParticles: THREE.Points;
  private glowPositions: Float32Array;
  private glowColors: Float32Array;

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

  // Shoot tracer lines
  private tracers: THREE.Line[] = [];

  // Blood decals
  private bloodDecals: THREE.Mesh[] = [];
  private decalCount = 0;

  // Screen shake
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimer = 0;
  private originalCamPos = new THREE.Vector3();

  // Entity geometry caches
  private civilianGeom: THREE.BufferGeometry;
  private civilianHeadGeom: THREE.BufferGeometry;
  private zombieGeom: THREE.BufferGeometry;
  private militaryGeom: THREE.BufferGeometry;
  private antennaGeom: THREE.BufferGeometry;

  // Building light meshes at night
  private buildingWindowLights: { mesh: THREE.Mesh; x: number; z: number }[] = [];

  constructor(container: HTMLElement) {
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
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0a1a, 0.015);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 200);
    this.camera.position.set(40, 35, 40);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 100;
    this.controls.target.set(0, 0, 0);

    // ─── Composer with Bloom ───
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      0.3,   // strength — subtle bloom for atmosphere
      0.5,   // radius
      0.1    // threshold
    );
    this.composer.addPass(bloomPass);

    // ─── Lights ───
    this.hemisphere = new THREE.HemisphereLight(0x87CEEB, 0x3a2a1a, 0.6);
    this.scene.add(this.hemisphere);

    this.ambient = new THREE.AmbientLight(0x404060, 0.4);
    this.scene.add(this.ambient);

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
    const skyGeom = new THREE.SphereGeometry(90, 32, 32);
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

    // ─── Ground ───
    const groundGeom = new THREE.PlaneGeometry(70, 70);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a2a1a,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.ground = new THREE.Mesh(groundGeom, groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.1;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // ─── Grid helper ───
    this.gridHelper = new THREE.GridHelper(70, 30, 0x2a3a2a, 0x1a2a1a);
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
    // Civilian: cylinder with sphere head
    this.civilianGeom = new THREE.CylinderGeometry(0.15, 0.2, 0.5, 6);
    this.civilianHeadGeom = new THREE.SphereGeometry(0.12, 6, 6);
    // Zombie: cone/diamond shape
    this.zombieGeom = new THREE.ConeGeometry(0.25, 0.55, 5);
    // Military: box with antenna
    this.militaryGeom = new THREE.BoxGeometry(0.3, 0.45, 0.3);
    this.antennaGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 3);

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

    // ─── Zombie glow particles ───
    const glowGeom = new THREE.BufferGeometry();
    this.glowPositions = new Float32Array(2000 * 3);
    this.glowColors = new Float32Array(2000 * 3);
    glowGeom.setAttribute('position', new THREE.BufferAttribute(this.glowPositions, 3));
    glowGeom.setAttribute('color', new THREE.BufferAttribute(this.glowColors, 3));
    const glowMat = new THREE.PointsMaterial({
      size: 0.5,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.glowParticles = new THREE.Points(glowGeom, glowMat);
    this.scene.add(this.glowParticles);

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

    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8, metalness: 0.1 });
    for (const r of state.map.roads) {
      const geom = new THREE.PlaneGeometry(r.w * 0.95, r.d * 0.95);
      const mesh = new THREE.Mesh(geom, roadMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(r.x, 0.01, r.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.roadMeshes.push(mesh);
    }

    // Road center markings (dashed white lines on main roads)
    const roadCells: { x: number; z: number; w: number; d: number }[] = [];
    for (const r of state.map.roads) {
      // Only add markings on larger road segments
      if (r.w > 2.8 || r.d > 2.8) {
        roadCells.push(r);
      }
    }
    // Create dashed center lines
    const dashMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
    for (const rc of roadCells) {
      const isHorizontal = rc.w > rc.d;
      const len = isHorizontal ? rc.w : rc.d;
      const segments = Math.floor(len / 0.6);
      for (let s = 0; s < segments; s += 2) {
        const start = -len / 2 + s * 0.6;
        const end = start + 0.3;
        const pts: THREE.Vector3[] = [];
        if (isHorizontal) {
          pts.push(new THREE.Vector3(rc.x + start, 0.03, rc.z));
          pts.push(new THREE.Vector3(rc.x + end, 0.03, rc.z));
        } else {
          pts.push(new THREE.Vector3(rc.x, 0.03, rc.z + start));
          pts.push(new THREE.Vector3(rc.x, 0.03, rc.z + end));
        }
        const g = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(g, dashMat);
        this.scene.add(line);
        this.roadMarkings.push(line);
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
      // Trees
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
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.7,
        metalness: b.type === 'police' ? 0.4 : 0.1,
        emissive: b.type === 'police' ? new THREE.Color(0x224466) : new THREE.Color(0x000000),
        emissiveIntensity: b.type === 'police' ? 0.15 : 0,
      });
      const geom = new THREE.BoxGeometry(b.w, b.h, b.d);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(b.x, b.h / 2, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.buildingId = b.id;
      this.scene.add(mesh);
      this.buildingMeshes.push(mesh);

      // Roof
      const roofMat2 = new THREE.MeshStandardMaterial({
        color: col.clone().multiplyScalar(0.7),
        roughness: 0.8,
      });
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(b.w * 0.9, b.d * 0.9), roofMat2);
      roof.rotation.x = -Math.PI / 2;
      roof.position.set(b.x, b.h + 0.03, b.z);
      this.scene.add(roof);
      this.buildingMeshes.push(roof);

      // Hospital red cross on roof
      if (b.type === 'hospital') {
        const crossMat = new THREE.MeshStandardMaterial({
          color: 0xff0000,
          emissive: 0xff0000,
          emissiveIntensity: 0.3,
        });
        // Horizontal bar
        const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.15), crossMat);
        hBar.position.set(b.x, b.h + 0.06, b.z);
        this.scene.add(hBar);
        this.buildingMeshes.push(hBar);
        // Vertical bar
        const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.6), crossMat);
        vBar.position.set(b.x, b.h + 0.06, b.z);
        this.scene.add(vBar);
        this.buildingMeshes.push(vBar);
      }

      // Police station — blue flashing light
      if (b.type === 'police') {
        const lightMat = new THREE.MeshStandardMaterial({
          color: 0x0044ff,
          emissive: 0x0044ff,
          emissiveIntensity: 0.5,
        });
        const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.15), lightMat);
        lightBar.position.set(b.x, b.h + 0.08, b.z);
        this.scene.add(lightBar);
        this.specialBuildingLights.push(lightBar);

        const lightMat2 = new THREE.MeshStandardMaterial({
          color: 0xff0000,
          emissive: 0xff0000,
          emissiveIntensity: 0.5,
        });
        const lightBar2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.5), lightMat2);
        lightBar2.position.set(b.x, b.h + 0.08, b.z);
        this.scene.add(lightBar2);
        this.specialBuildingLights.push(lightBar2);
      }

      // Windows with glow at night
      const hasWindows = b.type !== 'warehouse' || Math.random() < 0.5;
      if (hasWindows) {
        const winCountX = Math.max(1, Math.floor(b.w / 0.8));
        const winCountZ = Math.max(1, Math.floor(b.d / 0.8));
        for (let wy = 0.5; wy < b.h - 0.2; wy += 0.7) {
          for (let wi = 0; wi < winCountX + winCountZ; wi++) {
            let wx, wz;
            const onXSide = wi < winCountX;
            const idx = onXSide ? wi : wi - winCountX;
            if (onXSide) {
              wx = b.x - b.w / 2 + (idx + 0.5) * (b.w / winCountX);
              wz = b.z + b.d / 2 + 0.02;
            } else {
              wx = b.x + b.w / 2 + 0.02;
              wz = b.z - b.d / 2 + (idx + 0.5) * (b.d / winCountZ);
            }
            const winMat = new THREE.MeshStandardMaterial({
              color: 0x88aaff,
              emissive: 0x88ccff,
              emissiveIntensity: Math.random() * 0.5 + 0.1,
              transparent: true,
              opacity: 0.4 + Math.random() * 0.4,
            });
            const win = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), winMat);
            win.position.set(wx, wy, wz);
            if (!onXSide) {
              win.rotation.y = Math.PI / 2;
            }
            this.scene.add(win);
            this.windowGlows.push({ mesh: win, baseEmissive: 0.1 + Math.random() * 0.5 });
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
    (this.nightOverlay.material as THREE.MeshBasicMaterial).opacity = (1 - dayFactor) * 0.7;

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

    // ─── Sky color — more dramatic ───
    let skyColor: THREE.Color;
    if (dayFactor > 0.5) {
      // Day: blue
      skyColor = new THREE.Color(0x4a6a9a);
    } else if (time > 0.35 && time < 0.5) {
      // Sunset: orange
      const sunsetT = (time - 0.35) / 0.15;
      skyColor = new THREE.Color(1, 0.5 + 0.3 * (1 - sunsetT), 0.2 + 0.3 * (1 - sunsetT));
    } else if (time > 0.5 && time < 0.65) {
      // Sunrise
      const sunriseT = (time - 0.5) / 0.15;
      skyColor = new THREE.Color(1, 0.5 + 0.3 * sunriseT, 0.2 + 0.3 * sunriseT);
    } else {
      // Night: deep blue
      skyColor = new THREE.Color(0x05051a);
    }
    (this.sky.material as THREE.MeshBasicMaterial).color.lerp(skyColor, 0.05);

    // ─── Ambient ───
    this.ambient.intensity = (0.15 + dayFactor * 0.5) * 0.6;

    // ─── Sun movement ───
    const sunAngle = time * Math.PI * 2;
    this.directional.position.set(Math.cos(sunAngle) * 50, 20 + Math.sin(sunAngle) * 25, Math.sin(sunAngle) * 40);
    this.directional.intensity = dayFactor * 1.5 + 0.2;

    // ─── Fog — more dramatic at night ───
    const fogDensity = 0.008 + (1 - dayFactor) * 0.025 + (state.stats.zombies > 100 ? 0.005 : 0);
    (this.scene.fog as THREE.FogExp2).density = fogDensity;

    // ─── Building window glow at night ───
    for (const wg of this.windowGlows) {
      const mat = wg.mesh.material as THREE.MeshStandardMaterial;
      const nightBrightness = (1 - dayFactor);
      mat.emissiveIntensity = wg.baseEmissive * (0.2 + nightBrightness * 0.8);
    }

    // ─── Police lights flashing ───
    for (let i = 0; i < this.specialBuildingLights.length; i++) {
      const mat = this.specialBuildingLights[i].material as THREE.MeshStandardMaterial;
      const flash = Math.sin(state.totalTime * 4 + i * 2.5) > 0 ? 1 : 0.1;
      mat.emissiveIntensity = flash * 0.5 * (0.5 + (1 - dayFactor) * 0.5);
    }

    // ─── Update entities ───
    this.updateEntityMeshes(state, dayFactor, state.totalTime);

    // ─── Update glow ───
    this.updateGlowParticles(state, state.totalTime, dayFactor);

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

    // ─── Handle shot events ───
    for (const ev of state.events) {
      if (ev.text.startsWith('SHOT:')) {
        const parts = ev.text.split(':')[1].split(',').map(Number);
        if (parts.length === 4) {
          this.spawnTracer(parts[0], parts[1], parts[2], parts[3]);
          this.spawnParticleBurst(parts[2], parts[3], 0x44ff44, 20);
        }
      }
    }

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

  private updateEntityMeshes(state: SimulationState, dayFactor: number, time: number): void {
    const currentIds = new Set<number>();
    const toRender = state.entities.filter(e => e.state !== 'dead');

    for (const e of toRender) {
      currentIds.add(e.id);
      let group = this.entityMeshes.get(e.id);
      if (!group) {
        group = this.createEntityMesh(e);
        this.scene.add(group);
        this.entityMeshes.set(e.id, group);
      }

      group.position.set(e.x, 0, e.z);
      const col = new THREE.Color(e.color);

      // Update material colors
      group.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshStandardMaterial;
          if (child.userData.isBody || child.userData.isHead) {
            mat.color.copy(col);
          }

          if (e.type === 'zombie') {
            // Zombie pulsing glow — high emissive for bloom
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
            // Slow rotation for zombie menace
            group.rotation.y += 0.3 * (1/60);
          } else if (e.infectionTimer > 0) {
            // Infected — dramatic yellow-green pulse
            const pulse = 0.5 + Math.sin(time * 3 + e.id) * 0.4;
            if (child.userData.isBody) {
              mat.emissive.setHex(0x88ff44);
              mat.emissiveIntensity = pulse;
            }
            group.scale.set(
              1 + Math.sin(time * 2 + e.id) * 0.06,
              1 + Math.sin(time * 2 + e.id) * 0.06,
              1 + Math.sin(time * 2 + e.id) * 0.06
            );
          } else if (e.type === 'military' && child.userData.isBody) {
            mat.emissiveIntensity = 0.15;
            mat.emissive.setHex(0xff4444);
          } else if (child.userData.isBody) {
            mat.emissiveIntensity = 0.05;
          }
        }
      });
    }

    // Remove dead entity meshes
    for (const [id, group] of this.entityMeshes.entries()) {
      if (!currentIds.has(id)) {
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
    const col = new THREE.Color(e.color);

    if (e.type === 'civilian') {
      // Cylinder body with sphere head
      const bodyMat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.4,
        metalness: 0.05,
        emissive: col,
        emissiveIntensity: 0.05,
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

    } else if (e.type === 'zombie') {
      // Low-poly cone body with high emissive for bloom
      const bodyMat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.6,
        metalness: 0.0,
        emissive: new THREE.Color(0x44ff44),
        emissiveIntensity: 1.0, // High for bloom
      });
      const body = new THREE.Mesh(this.zombieGeom, bodyMat);
      body.position.y = 0.28;
      body.castShadow = true;
      body.userData.isBody = true;
      group.add(body);

      // Small sphere "head"
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
      // Box body
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

      // Head
      const headMat = new THREE.MeshStandardMaterial({
        color: 0xccaa88,
        roughness: 0.5,
      });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 5), headMat);
      head.position.y = 0.5;
      head.userData.isHead = true;
      group.add(head);

      // Antenna
      const antMat = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        emissive: 0xff4444,
        emissiveIntensity: 0.3,
        metalness: 0.5,
      });
      const ant = new THREE.Mesh(this.antennaGeom, antMat);
      ant.position.y = 0.65;
      ant.userData.isAntenna = true;
      group.add(ant);

      // Tiny red dot on antenna tip
      const dotMat = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.8,
      });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), dotMat);
      dot.position.y = 0.75;
      dot.userData.isAntenna = true;
      group.add(dot);
    }

    return group;
  }

  private updateGlowParticles(state: SimulationState, time: number, dayFactor: number): void {
    const zombies = state.entities.filter(e => e.type === 'zombie' && e.state !== 'dead');
    // Reduce glow particles at high zombie counts for performance
    const glowPerZombie = zombies.length > 100 ? 3 : zombies.length > 50 ? 4 : 6;
    let idx = 0;
    const maxGlow = Math.min(1800, zombies.length * glowPerZombie + 100);
    for (const z of zombies) {
      for (let j = 0; j < glowPerZombie && idx < maxGlow; j++) {
        const angle = Math.random() * Math.PI * 2;
        const rad = 0.4 + Math.random() * 0.7;
        const pulse = Math.sin(time * 2 + z.id * 0.5 + j) * 0.2;
        this.glowPositions[idx * 3] = z.x + Math.cos(angle) * (rad + pulse);
        this.glowPositions[idx * 3 + 1] = 0.15 + Math.random() * 0.4;
        this.glowPositions[idx * 3 + 2] = z.z + Math.sin(angle) * (rad + pulse);
        this.glowColors[idx * 3] = 0.1 + Math.random() * 0.2;
        this.glowColors[idx * 3 + 1] = 0.4 + Math.random() * 0.5;
        this.glowColors[idx * 3 + 2] = 0.05;
        idx++;
      }
    }
    for (let i = idx * 3; i < this.glowPositions.length; i++) {
      this.glowPositions[i] = 0;
    }
    (this.glowParticles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.glowParticles.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.glowParticles.geometry.setDrawRange(0, idx);
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

      // Wrap around map
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
      const opacity = (tracer.material as THREE.LineBasicMaterial).opacity;
      if (opacity <= 0) {
        this.scene.remove(tracer);
        tracer.geometry.dispose();
        this.tracers.splice(i, 1);
      } else {
        (tracer.material as THREE.LineBasicMaterial).opacity -= dt * 3;
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

  spawnTracer(fromX: number, fromZ: number, toX: number, toZ: number): void {
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffff44,
      transparent: true,
      opacity: 1.0,
    });
    const points = [
      new THREE.Vector3(fromX, 0.4, fromZ),
      new THREE.Vector3(toX, 0.1, toZ),
    ];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geom, lineMat);
    this.scene.add(line);
    this.tracers.push(line);

    this.addBloodDecal(toX, toZ);
  }

  addBloodDecal(x: number, z: number): void {
    if (this.decalCount > 150) return;
    this.decalCount++;

    const size = 0.1 + Math.random() * 0.2;
    const geom = new THREE.CircleGeometry(size, 4);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.15 + Math.random() * 0.2, 0.4 + Math.random() * 0.2, 0.05),
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

    this.clearMeshes();

    const pos = this.particlePositions;
    for (let i = 0; i < this.particleData.length; i++) {
      pos[i * 3] = 0;
      pos[i * 3 + 1] = -10;
      pos[i * 3 + 2] = 0;
      this.particleData[i] = { vx: 0, vz: 0, life: 0, maxLife: 0, r: 1, g: 1, b: 1 };
    }

    this.decalCount = 0;
    this.glowPositions.fill(0);
    this.glowColors.fill(0);
    this.shakeTimer = 0;
  }

  dispose(): void {
    this.renderer.dispose();
    this.composer.dispose();
    window.removeEventListener('resize', () => {});
  }
}
