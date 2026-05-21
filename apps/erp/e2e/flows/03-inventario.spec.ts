import { test, expect } from '@playwright/test'
import { login, expectPageOk, fillSearch } from '../helpers'

const GERENTE = { email: 'rene_perez@safesoft.tech', password: 'RaPr9392542' }

// ═══════════════════════════════════════════════════════════════════════════════
// Inventario - Búsqueda y detalle de producto
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Inventario - Búsqueda y detalle', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/inventario', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Busca producto FEB-026 y abre el detalle', async ({ page }) => {
        await expectPageOk(page)
        await fillSearch(page, 'FEB-026')
        const product = page.getByText(/FEB-026/i).first()
        await expect(product).toBeVisible({ timeout: 10000 })
        await product.click()
        await page.waitForTimeout(2000)

        const detailHeader = page.getByText(/detalle de producto|producto/i).first()
        expect(await detailHeader.isVisible().catch(() => false)).toBeTruthy()
    })

    test('Navega al formulario de nuevo producto y comprueba campos', async ({ page }) => {
        const newBtn = page.getByRole('link', { name: /nuevo|crear producto/i }).first()
        await expect(newBtn).toBeVisible({ timeout: 10000 })
        await newBtn.click()
        await page.waitForTimeout(2000)
        await expectPageOk(page)

        const nameField = page.getByPlaceholder(/nombre|producto/i).first()
        await expect(nameField).toBeVisible({ timeout: 10000 })
        const skuField = page.getByPlaceholder(/código|sku|referencia/i).first()
        expect(await skuField.isVisible().catch(() => false)).toBeTruthy()
    })

    test('Abre detalle de un producto y va a editar el activo', async ({ page }) => {
        await fillSearch(page, 'FEB-026')
        const product = page.getByText(/FEB-026/i).first()
        await expect(product).toBeVisible({ timeout: 10000 })
        await product.click()
        await page.waitForTimeout(1500)

        const manageButton = page.getByRole('button', { name: /Gestionar Activo/i }).first()
        await expect(manageButton).toBeVisible({ timeout: 10000 })
        await manageButton.click()
        await page.waitForTimeout(1500)

        await expect(page.getByText(/Editar Repuesto/i).first()).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('button', { name: /Volver al Inventario|Cancelar|Guardar|Actualizar/i }).first()).toBeVisible({ timeout: 10000 })
    })

    test('Activa vista consolidada y valida el cambio', async ({ page }) => {
        const consolidatedToggle = page.getByText(/consolidado|todas/i).first()
        if (await consolidatedToggle.isVisible().catch(() => false)) {
            await consolidatedToggle.click()
            await page.waitForTimeout(2000)
        }
        const consolidatedLabel = page.getByText(/consolidado/i).first()
        expect(await consolidatedLabel.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Inventario - Ajuste de stock
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Inventario - Ajuste de stock', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/inventario', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Abre opciones de ajuste desde un producto', async ({ page }) => {
        await fillSearch(page, 'FEB-026')
        const product = page.getByText(/FEB-026/i).first()
        await expect(product).toBeVisible({ timeout: 10000 })
        await product.click()
        await page.waitForTimeout(1500)

        const adjustButton = page.getByRole('button', { name: /ajustar|stock|cantidad/i }).first()
        expect(await adjustButton.isVisible().catch(() => false)).toBeTruthy()
    })
})
