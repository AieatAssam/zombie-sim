import { describe, it, expect } from 'vitest';

describe('Renderer', () => {
  it('should be importable', async () => {
    // The renderer depends on Three.js which needs WebGL
    // Just verify the module can be loaded without crashing
    let Renderer3D: any;
    try {
      const mod = await import('../renderer');
      Renderer3D = mod.Renderer3D;
    } catch (e: any) {
      // In test environment without DOM/WebGL, this may fail
      // That's expected — we just verify the module structure
    }
    // Verify the export exists (even if instantiation fails)
    expect(typeof Renderer3D).toBe('function');
  });

  it('should export Simulation class', async () => {
    const simModule = await import('../simulation');
    expect(simModule.Simulation).toBeDefined();
  });
});
