import { expect, test } from '@playwright/test';
import { mockInternetMapBackends } from './helpers/mapMock';

test.describe('internet map 3D pages', () => {
  test('IXMap3D page loads toolbar and toggles settings', async ({ page }) => {
    await mockInternetMapBackends(page);
    await page.goto('/dev/ixMap3D');

    await expect(page.getByTestId('internet-map-3d-toolbar')).toContainText('3D IX Map');
    await page.getByTestId('internet-map-3d-settings-toggle').click();
    await expect(page.getByTestId('internet-map-3d-settings')).toBeVisible();
    await expect(page.getByText('Node / link scale')).toBeVisible();
    await expect(page.getByText('Router labels')).toBeVisible();
  });

  test('UploadMap page exposes the upload entry for 3D graph rendering', async ({ page }) => {
    await mockInternetMapBackends(page);
    await page.goto('/dev/uploadMap');

    await expect(page.getByTestId('upload-map-3d-upload-panel')).toBeVisible();
    await expect(page.getByText('Drop file here or')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Parse file' })).toBeVisible();
  });
});
