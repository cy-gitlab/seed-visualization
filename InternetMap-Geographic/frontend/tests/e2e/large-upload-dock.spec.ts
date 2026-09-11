import path from 'node:path';
import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });

test('10k upload keeps dock tabs responsive', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.route('**/satellite-tiles/**', route => route.abort());
  await page.addInitScript(() => {
    (window as any).__dockMetrics = { graphUpdates: 0, visibilityUpdates: 0, topologyClears: 0, frames: 0, clicks: [], longTasks: [] };
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) (window as any).__dockMetrics.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ entryTypes: ['longtask'] });
    document.addEventListener('click', event => {
      const button = (event.target as Element).closest('.emulator-topology-3d-tabs button');
      if (!button) return;
      const metrics = (window as any).__dockMetrics;
      const item: any = { name: button.textContent?.trim(), start: performance.now(), graphUpdates: metrics.graphUpdates, frames: metrics.frames };
      metrics.clicks.push(item);
      const observer = new MutationObserver(() => {
        if (!button.classList.contains('active')) return;
        item.domMs = performance.now() - item.start;
        observer.disconnect();
        requestAnimationFrame(() => {
          item.frameMs = performance.now() - item.start;
          item.extraGraphUpdates = metrics.graphUpdates - item.graphUpdates;
          item.extraFrames = metrics.frames - item.frames;
        });
      });
      observer.observe(button, { attributes: true, attributeFilter: ['class'] });
    }, true);
  });
  await page.route('**/cesiumScene*', async route => {
    const response = await route.fetch();
    const body = await response.text();
    const instrumented = body.replace(/function renderGraph\(graph, \w+ = \{\}\) \{/, match => match + ' window.__dockMetrics.graphUpdates++;')
      .replace('lines.removeAll();', 'window.__dockMetrics.topologyClears++; lines.removeAll();')
      .replace(/function setTopologyVisibility\([^)]*\) \{/, match => match + ' window.__dockMetrics.visibilityUpdates++;')
      .replace('viewer.scene.preRender.addEventListener(updatePacketHops)', 'viewer.scene.preRender.addEventListener(() => window.__dockMetrics.frames++); viewer.scene.preRender.addEventListener(updatePacketHops)');
    expect(instrumented).not.toBe(body);
    expect(instrumented).toContain('window.__dockMetrics.graphUpdates++;');
    expect(instrumented).toContain('window.__dockMetrics.topologyClears++;');
    expect(instrumented).toContain('window.__dockMetrics.visibilityUpdates++;');
    await route.fulfill({ response, body: instrumented });
  });
  await page.goto('/dev/upload/3d');
  await page.locator('input[type=file]').setInputFiles(path.resolve('../examples/large-internet-10k/docker-compose-10k.yml'));
  await page.getByRole('button', { name: 'Parse file', exact: true }).click();
  const dock = page.getByTestId('emulator-topology-3d-dock');
  await expect(dock).toBeVisible({ timeout: 120_000 });
  await expect(page.locator('.emulator-topology-loading-overlay')).toHaveCount(0, { timeout: 120_000 });
  const timings: Record<string, number> = {};
  await page.evaluate(() => { (window as any).__dockMetrics.longTasks = []; });
  for (let round = 0; round < 2; round++) {
    for (const name of ['Settings', 'Traffic Replay', 'Overview']) {
      const start = Date.now();
      const button = dock.getByRole('button', { name, exact: true });
      await button.click({ timeout: 15000 });
      await expect(button).toHaveClass(/active/, { timeout: 5000 });
      timings[`${round}-${name}`] = Date.now() - start;
    }
  }
  await dock.getByRole('button', { name: 'Settings', exact: true }).click();
  const beforeVisibility = await page.evaluate(() => ({
    updates: (window as any).__dockMetrics.graphUpdates,
    visibilityUpdates: (window as any).__dockMetrics.visibilityUpdates,
    clears: (window as any).__dockMetrics.topologyClears,
  }));
  const hostVisibility = dock.getByRole('checkbox', { name: 'Host', exact: true });
  await dock.getByText('Host', { exact: true }).click();
  await expect(hostVisibility).not.toBeChecked();
  await page.waitForFunction(updates => (window as any).__dockMetrics.visibilityUpdates > updates, beforeVisibility.visibilityUpdates);
  const afterVisibility = await page.evaluate(() => ({
    updates: (window as any).__dockMetrics.graphUpdates,
    visibilityUpdates: (window as any).__dockMetrics.visibilityUpdates,
    clears: (window as any).__dockMetrics.topologyClears,
  }));
  expect(afterVisibility.updates).toBe(beforeVisibility.updates);
  expect(afterVisibility.visibilityUpdates).toBe(beforeVisibility.visibilityUpdates + 1);
  expect(afterVisibility.clears).toBe(beforeVisibility.clears);
  const metrics = await page.evaluate(() => (window as any).__dockMetrics);
  await testInfo.attach('dock-diagnostics', { body: JSON.stringify(metrics), contentType: 'application/json' });
  expect(metrics.graphUpdates).toBeGreaterThan(0);
  expect(metrics.clicks).toHaveLength(7);
  for (const click of metrics.clicks.slice(0, 6)) {
    expect(click.domMs).toBeLessThan(1000);
    expect(click.extraGraphUpdates).toBe(0);
  }
  expect(Object.keys(timings)).toHaveLength(6);
  await testInfo.attach('dock-switch-times-ms', { body: JSON.stringify(timings), contentType: 'application/json' });
  console.log('10k dock switch times (ms):', timings);
});
