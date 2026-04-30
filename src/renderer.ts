// 3D Renderer v2 — Three.js scene, effects, and visuals

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SimulationState, Entity } from './simulation';

export class Renderer3D {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;

  private entityMeshes: Map<number, THREE.Mesh> = new Map();
  private buildingMeshes: THREE.Mesh[] = [];
  private roadMeshes: THREE.Mesh[] = [];
  private parkMeshes: THREE.Mesh[] = [];
  private treeMeshes: THREE.Mesh[] = [];
  private wallMeshes: THREE.Mesh[] = [];

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

  // Zombie glow
  private glowParticles: THREE.Points;
  private glowPositions: Float32Array;
  private glowColors: Float32Array;

  // Sky / atmosphere
  private sky: THREE.Mesh;
  private stars: THREE.Points;
  private starPositions: Float32Array;

  // Ground
  private ground: THREE.Mesh;
  private nightOverlay: THREE.Mesh;

  // Shoot tracer lines
  private tracers: THREE.Line[] = [];

  // Blood decals (small colored circles on ground)
  private bloodDecals: THREE.Mesh[] = [];
  private decalCount = 0;

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
    const skyGeom = new THREE.SphereGeometry(90, 20, 20);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x0a0a2a,
      side: THREE.BackSide,
    });
    this.sky = new THREE.Mesh(skyGeom, skyMat);
    this.scene.add(this.sky);

    // ─── Stars ───
    const starGeom = new THREE.BufferGeometry();
    this.starPositions = new Float32Array(2000 * 3);
    for (let i = 0; i < 2000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 85 + Math.random() * 5;
      this.starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      this.starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi)); // Only upper hemisphere
      this.starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(this.starPositions, 3));
    this.stars = new THREE.Points(starGeom, new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.3,
      transparent: true,
      opacity: 0,
    }));
    this.scene.add(this.stars);

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

    // ─── Particle system ───
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

    // Parks
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 1.0 });
    for (const p of state.map.parks) {
      const geom = new THREE.CircleGeometry(p.r * 0.8, 8);
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
          new THREE.SphereGeometry(crownH, 5, 5),
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

      // Windows (lit for special buildings and some random)
      if (b.type === 'police' || b.type === 'hospital' || Math.random() < 0.3) {
        const winMat = new THREE.MeshStandardMaterial({
          color: 0xffff88,
          emissive: 0xffdd44,
          emissiveIntensity: 0.2 + Math.random() * 0.3,
          transparent: true,
          opacity: 0.3 + Math.random() * 0.4,
        });
        for (let wy = 0.6; wy < b.h - 0.3; wy += 0.9) {
          for (let ww = -b.w / 2 + 0.3; ww < b.w / 2 - 0.2; ww += 0.9) {
            const win = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), winMat);
            win.position.set(b.x + ww, wy, b.z + b.d / 2 + 0.02);
            this.scene.add(win);
            this.buildingMeshes.push(win);
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
    const all = [...this.buildingMeshes, ...this.roadMeshes, ...this.parkMeshes, ...this.treeMeshes, ...this.wallMeshes, ...this.bloodDecals];
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

    for (const t of this.tracers) {
      this.scene.remove(t);
      t.geometry.dispose();
    }
    this.tracers = [];
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

    // Night overlay
    (this.nightOverlay.material as THREE.MeshBasicMaterial).opacity = (1 - dayFactor) * 0.7;

    // Stars visibility
    (this.stars.material as THREE.PointsMaterial).opacity = (1 - dayFactor) * 0.8;

    // Sky color
    const skyTarget = new THREE.Color(
      dayFactor > 0.5
        ? (isNight ? 0x0a0a2a : 0x4a6a9a)
        : (0x1a1a3a + 0x303060 * dayFactor)
    );
    (this.sky.material as THREE.MeshBasicMaterial).color.lerp(skyTarget, 0.03);

    // Ambient
    this.ambient.intensity = (0.15 + dayFactor * 0.5) * 0.6;

    // Sun
    const sunAngle = time * Math.PI * 2;
    this.directional.position.set(Math.cos(sunAngle) * 50, 20 + Math.sin(sunAngle) * 25, Math.sin(sunAngle) * 40);
    this.directional.intensity = dayFactor * 1.5 + 0.2;

    // Fog
    const fogDensity = 0.008 + (1 - dayFactor) * 0.02 + (state.stats.zombies > 100 ? 0.005 : 0);
    (this.scene.fog as THREE.FogExp2).density = fogDensity;

    // Update entities
    this.updateEntityMeshes(state, dayFactor, state.totalTime);

    // Update glow
    this.updateGlowParticles(state, state.totalTime);

    // Update particles
    this.updateParticles(dt);

    // Update blood decals lifecycle (fade oldest)
    if (this.bloodDecals.length > 100) {
      const old = this.bloodDecals.shift();
      if (old) {
        this.scene.remove(old);
        old.geometry.dispose();
        (old.material as THREE.Material).dispose();
      }
    }

    // Handle shot events (spawn muzzle flash + tracer)
    for (const ev of state.events) {
      if (ev.text.startsWith('SHOT:')) {
        const parts = ev.text.split(':')[1].split(',').map(Number);
        if (parts.length === 4) {
          this.spawnTracer(parts[0], parts[1], parts[2], parts[3]);
          this.spawnParticleBurst(parts[2], parts[3], 0x44ff44, 20);
        }
      }
    }

    // Clean up old shot events from events array (we copy array so this is fine)
    // (We don't actually delete them here, main.ts handles that)

    // Update tracers
    this.updateTracers(dt);

    // Controls
    this.controls.update();

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  private updateEntityMeshes(state: SimulationState, dayFactor: number, time: number): void {
    const currentIds = new Set<number>();
    const toRender = state.entities.filter(e => e.state !== 'dead');

    for (const e of toRender) {
      currentIds.add(e.id);
      let mesh = this.entityMeshes.get(e.id);
      if (!mesh) {
        const geom = new THREE.SphereGeometry(e.type === 'military' ? 0.4 : 0.35, 12, 12);
        const col = new THREE.Color(e.color);
        const mat = new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.1,
          roughness: 0.3,
          metalness: 0.1,
        });
        mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.entityMeshes.set(e.id, mesh);
      }

      mesh.position.set(e.x, 0.45, e.z);
      const col = new THREE.Color(e.color);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.copy(col);

      if (e.type === 'zombie') {
        // Pulse effect
        const pulse = 0.3 + Math.sin(time * 2.5 + e.id * 0.7) * 0.4;
        mat.emissive.copy(col);
        mat.emissiveIntensity = pulse;
        mesh.scale.set(
          1 + Math.sin(time * 1.5 + e.id) * 0.04,
          1 + Math.sin(time * 1.5 + e.id) * 0.04,
          1 + Math.sin(time * 1.5 + e.id) * 0.04
        );
      } else if (e.infectionTimer > 0) {
        const pulse = 0.3 + Math.sin(time * 3 + e.id) * 0.3;
        mat.emissive.setHex(0x88ff44);
        mat.emissiveIntensity = pulse;
        mesh.scale.set(
          1 + Math.sin(time * 2 + e.id) * 0.06,
          1 + Math.sin(time * 2 + e.id) * 0.06,
          1 + Math.sin(time * 2 + e.id) * 0.06
        );
      } else if (e.type === 'military') {
        mat.emissiveIntensity = 0.15;
        mesh.scale.set(1.15, 1.15, 1.15);
      } else {
        mat.emissiveIntensity = 0.05;
        mesh.scale.set(1, 1, 1);
      }
    }

    // Remove dead entity meshes
    for (const [id, mesh] of this.entityMeshes.entries()) {
      if (!currentIds.has(id)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.MeshStandardMaterial).dispose();
        this.entityMeshes.delete(id);
      }
    }
  }

  private updateGlowParticles(state: SimulationState, time: number): void {
    const zombies = state.entities.filter(e => e.type === 'zombie' && e.state !== 'dead');
    let idx = 0;
    for (const z of zombies) {
      for (let j = 0; j < 6 && idx < 1800; j++) {
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

    // Also add a blood splat at target
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
    for (const mesh of this.entityMeshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.MeshStandardMaterial).dispose();
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
  }

  dispose(): void {
    this.renderer.dispose();
    window.removeEventListener('resize', () => {});
  }
}
