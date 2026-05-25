import { test, expect } from '@playwright/test';
import { login, GERENTE } from '../helpers';

test('Capture Dashboard Tour Screenshots', async ({ page }) => {
    // 1. Log in as GERENTE
    await login(page, GERENTE);

    // 2. Go to /inicio and wait for it to load
    await page.goto('/inicio', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-tour="inicio-kpis"]')).toBeVisible({ timeout: 15000 });

    // 3. Take initial screenshot
    await page.screenshot({ path: 'C:/Users/Rene_/.gemini/antigravity-ide/brain/78bf2075-a585-42a7-b4f6-bcdb7fda1835/dashboard_initial.png' });

    // 4. Open interactive guides menu
    const helpBtn = page.locator('button[title="Guías interactivas"]');
    await expect(helpBtn).toBeVisible({ timeout: 5000 });
    await helpBtn.click();
    await page.waitForTimeout(500);

    // 5. Start the "Conoce el panel de inicio" tour
    const startTourBtn = page.locator('button:has-text("Conoce el panel de inicio")');
    await expect(startTourBtn).toBeVisible({ timeout: 5000 });
    await startTourBtn.click();
    await page.waitForTimeout(1000);

    // Step 1: Welcome
    await expect(page.locator('.driver-popover')).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: 'C:/Users/Rene_/.gemini/antigravity-ide/brain/78bf2075-a585-42a7-b4f6-bcdb7fda1835/step_1.png' });
    await page.locator('.driver-popover-next-btn').click();
    await page.waitForTimeout(1000);

    // Step 2: Metrics/KPIs
    await page.screenshot({ path: 'C:/Users/Rene_/.gemini/antigravity-ide/brain/78bf2075-a585-42a7-b4f6-bcdb7fda1835/step_2.png' });
    await page.locator('.driver-popover-next-btn').click();
    await page.waitForTimeout(1000);

    // Step 3: Financial Overview
    await page.screenshot({ path: 'C:/Users/Rene_/.gemini/antigravity-ide/brain/78bf2075-a585-42a7-b4f6-bcdb7fda1835/step_3.png' });
    await page.locator('.driver-popover-next-btn').click();
    await page.waitForTimeout(1000);

    // Step 4: Trend Chart
    await page.screenshot({ path: 'C:/Users/Rene_/.gemini/antigravity-ide/brain/78bf2075-a585-42a7-b4f6-bcdb7fda1835/step_4.png' });
    await page.locator('.driver-popover-next-btn').click();
    await page.waitForTimeout(1000);

    // Step 5: Activity List
    await page.screenshot({ path: 'C:/Users/Rene_/.gemini/antigravity-ide/brain/78bf2075-a585-42a7-b4f6-bcdb7fda1835/step_5.png' });
    await page.locator('.driver-popover-next-btn').click();
    await page.waitForTimeout(1000);

    // Step 6: Search Button
    await page.screenshot({ path: 'C:/Users/Rene_/.gemini/antigravity-ide/brain/78bf2075-a585-42a7-b4f6-bcdb7fda1835/step_6.png' });
    await page.locator('.driver-popover-next-btn').click();
    await page.waitForTimeout(1000);

    // Step 7: Header User
    await page.screenshot({ path: 'C:/Users/Rene_/.gemini/antigravity-ide/brain/78bf2075-a585-42a7-b4f6-bcdb7fda1835/step_7.png' });
    await page.locator('.driver-popover-next-btn').click();
    await page.waitForTimeout(1000);
});
