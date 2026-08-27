import { expect, test } from '@playwright/test';
import { mockInternetMapBackends } from './helpers/mapMock';

test.describe('internet map 3D emulator topology pages', () => {
  test('live emulator topology page loads from mocked Docker API data', async ({ page }) => {
    await mockInternetMapBackends(page);
    await page.goto('/dev/liveEmulatorTopology3D');

    await expect(page.getByText('Live Emulator Topology 3D')).toBeVisible();
    await expect(page.getByText(/nodes/)).toBeVisible();
  });

  test('file-based emulator topology page shows compose upload entry', async ({ page }) => {
    await mockInternetMapBackends(page);
    await page.goto('/dev/emulatorTopology3D');

    await expect(page.getByTestId('emulator-topology-3d-upload-page')).toBeVisible();
    await expect(page.getByText('Drop file here or')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Parse file' })).toBeVisible();
  });
});
