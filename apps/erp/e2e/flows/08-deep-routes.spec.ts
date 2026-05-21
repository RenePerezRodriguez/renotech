import { test, expect } from '@playwright/test'
import { login, expectPageOk, GERENTE } from '../helpers'

// ═══════════════════════════════════════════════════════════════════════════════
// Cobertura profunda de rutas dinámicas y de utilidad
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Cobertura de rutas profundas', () => {
    test('Carga configuracion/actualizar-precios y muestra el botón de actualización', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/configuracion/actualizar-precios', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByText(/Update Product Prices/i).first()).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('button', { name: /Run Update Script/i }).first()).toBeVisible({ timeout: 10000 })
    })

    test('Abre detalle de pedido desde la lista de pedidos', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/pedidos', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        const firstOrder = page.locator('ul > li button').first()
        await expect(firstOrder).toBeVisible({ timeout: 10000 })
        await firstOrder.click()
        await page.waitForTimeout(1500)

        await expect(page.getByText(/Exportar|Pedido/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('Abre detalle de envío desde la lista de envíos', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/envios', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        const firstShipment = page.locator('ul > li button').first()
        await expect(firstShipment).toBeVisible({ timeout: 10000 })
        await firstShipment.click()
        await page.waitForTimeout(1500)

        await expect(page.getByText(/Envío|Recibido|En preparación|En tránsito/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('Abre detalle de venta específico desde la lista de ventas', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/ventas', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        const firstSale = page.getByText(/VEN-[A-Z0-9]+/).first()
        await expect(firstSale).toBeVisible({ timeout: 10000 })
        await firstSale.click()
        await page.waitForTimeout(1500)

        await expect(page.getByRole('button', { name: /IMPRIMIR COMPROBANTE/i }).first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga verificar/[id] usando un ID real de ventas', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/ventas', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        const codeElement = page.getByText(/VEN-[A-Z0-9]+/).first()
        await expect(codeElement).toBeVisible({ timeout: 10000 })
        const saleCode = await codeElement.innerText()

        await page.goto(`/verificar/${saleCode}`, { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(new RegExp(`/verificar/${saleCode.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`))
        await expect(page.getByText(/Historial de Ventas/i).first()).toBeVisible({ timeout: 10000 })
    })
})
