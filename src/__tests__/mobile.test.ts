import { describe, it, expect } from 'vitest';
import { chromium } from 'playwright-core';

describe('Mobile Viewport', () => {
  const BASE_OPTS = {
    executablePath: '/home/openclaw/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    args: ['--no-sandbox', '--headless=new'],
  };
  it('should not have legend covering the screen top on iPhone 12 (390x844)', async () => {
    const browser = await chromium.launch(BASE_OPTS);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      const hud = document.getElementById('hud');
      const legend = document.getElementById('legend-panel');
      const feed = document.querySelector('.event-feed');

      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        hudBottom: hud ? hud.getBoundingClientRect().bottom : -1,
        legendTop: legend ? legend.getBoundingClientRect().top : -1,
        legendBottom: legend ? legend.getBoundingClientRect().bottom : -1,
        legendHeight: legend ? legend.getBoundingClientRect().height : 0,
        legendWidth: legend ? legend.getBoundingClientRect().width : 0,
        legendVisible: legend ? legend.classList.contains('visible') : false,
        legendOverlapsHud: hud && legend ?
          (legend.getBoundingClientRect().bottom > hud.getBoundingClientRect().top) : false,
        feedTop: feed ? feed.getBoundingClientRect().top : -1,
      };
    });

    // Legend should be visible
    expect(info.legendVisible).toBe(true);

    // Legend height should be reasonable - less than 30% of viewport
    expect(info.legendHeight / info.vh).toBeLessThan(0.3);

    // Legend should take up less than 35% of viewport height  
    expect(info.legendHeight / info.vh).toBeLessThan(0.35);

    // Legend should not be full width on mobile
    expect(info.legendWidth / info.vw).toBeLessThan(0.8);

    await browser.close();
  });

  it('should be usable on tiny viewport (320x568 - iPhone SE)', async () => {
    const browser = await chromium.launch(BASE_OPTS);
    const page = await browser.newPage({ viewport: { width: 320, height: 568 } });
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      const hud = document.getElementById('hud');
      const legend = document.getElementById('legend-panel');
      const feed = document.querySelector('.event-feed');
      const chart = document.getElementById('chart-container');
      const gameover = document.getElementById('gameover');

      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        hudBottom: hud ? hud.getBoundingClientRect().bottom : -1,
        hudHeight: hud ? hud.getBoundingClientRect().height : 0,
        legendTop: legend ? legend.getBoundingClientRect().top : -1,
        legendHeight: legend ? legend.getBoundingClientRect().height : 0,
        legendWidth: legend ? legend.getBoundingClientRect().width : 0,
        legendVisible: legend ? legend.classList.contains('visible') : false,
        feedExists: !!feed,
        chartExists: !!chart,
        gameoverExists: !!gameover,
        hudPercent: hud ? (hud.getBoundingClientRect().height / window.innerHeight) * 100 : 0,
      };
    });

    // HUD should take up less than 45% of screen height
    expect(info.hudPercent).toBeLessThan(45);

    // Legend should be visible
    expect(info.legendVisible).toBe(true);

    // Legend should be compact
    expect(info.legendHeight).toBeLessThan(info.vh * 0.4);

    // Core elements exist
    expect(info.feedExists).toBe(true);
    expect(info.chartExists).toBe(true);

    await browser.close();
  });

  it('should toggle legend visibility with keyboard on mobile', async () => {
    const browser = await chromium.launch(BASE_OPTS);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Initially visible
    const init = await page.evaluate(() =>
      document.getElementById('legend-panel')?.classList.contains('visible')
    );
    expect(init).toBe(true);

    // Press L to hide
    await page.keyboard.press('KeyL');
    await page.waitForTimeout(300);

    const hidden = await page.evaluate(() =>
      document.getElementById('legend-panel')?.classList.contains('visible')
    );
    expect(hidden).toBe(false);

    // Press L to show again
    await page.keyboard.press('KeyL');
    await page.waitForTimeout(300);

    const visible = await page.evaluate(() =>
      document.getElementById('legend-panel')?.classList.contains('visible')
    );
    expect(visible).toBe(true);

    // Click X button to close
    const closeBtn = await page.$('#legend-close');
    expect(closeBtn).not.toBeNull();

    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(300);

      const afterX = await page.evaluate(() =>
        document.getElementById('legend-panel')?.classList.contains('visible')
      );
      expect(afterX).toBe(false);
    }

    await browser.close();
  });
});
