import { test, expect } from '@playwright/test'
import { login, expectPageOk, fillSearch } from '../helpers'

const CAJERO = { email: 'rene_perez@outlook.it', password: 'RaPr9392542' }

// ═══════════════════════════════════════════════════════════════════════════════
// POS - Venta completa en efectivo
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('POS - Flujo completo de venta', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, CAJERO)
        await page.goto('/punto-de-venta', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Agrega producto al carrito y finaliza venta en efectivo', async ({ page }) => {
        await expectPageOk(page)
        const searchInput = page.getByPlaceholder(/buscar/i).first()
        await expect(searchInput).toBeVisible({ timeout: 10000 })
        await searchInput.fill('FEB-026')
        await page.waitForTimeout(2000)

        const productCard = page.getByText(/FEB-026/i).first()
        await expect(productCard).toBeVisible({ timeout: 10000 })
        await productCard.click()
        await page.waitForTimeout(1500)

        const cartTotal = page.getByText(/total a cobrar|total/i).first()
        await expect(cartTotal).toBeVisible({ timeout: 10000 })

        const cobrarBtn = page.getByRole('button', { name: /cobrar|pagar/i }).first()
        await expect(cobrarBtn).toBeVisible({ timeout: 10000 })
        await cobrarBtn.click()
        await page.waitForTimeout(2000)

        const successMessage = page.locator('text=/venta.*registrada|venta exitosa|exito/i').first()
        expect(await successMessage.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// POS - Suspender y reanudar venta
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('POS - Suspender y reanudar venta', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, CAJERO)
        await page.goto('/punto-de-venta', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Suspende una venta y verifica el historial suspendido', async ({ page }) => {
        const searchInput = page.getByPlaceholder(/buscar/i).first()
        await expect(searchInput).toBeVisible({ timeout: 10000 })
        await searchInput.fill('FEB-026')
        await page.waitForTimeout(2000)

        const product = page.getByText(/FEB-026/i).first()
        await expect(product).toBeVisible({ timeout: 10000 })
        await product.click()
        await page.waitForTimeout(1500)

        const suspendBtn = page.getByRole('button', { name: /suspender/i }).first()
        await expect(suspendBtn).toBeVisible({ timeout: 10000 })
        await suspendBtn.click()
        await page.waitForTimeout(2000)

        const historyBtn = page.getByRole('button', { name: /historial|ventas suspendidas/i }).first()
        await expect(historyBtn).toBeVisible({ timeout: 10000 })
        await historyBtn.click()
        await page.waitForTimeout(2000)

        const suspendedRow = page.getByText(/suspendida|suspendido/i).first()
        expect(await suspendedRow.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// POS - Cargar cotización al punto de venta
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('POS - Cargar cotización', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, CAJERO)
        await page.goto('/punto-de-venta', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Abre el selector de cotizaciones y muestra una lista', async ({ page }) => {
        const quoteBtn = page.getByRole('button', { name: /cotización|cotizaciones/i }).first()
        await expect(quoteBtn).toBeVisible({ timeout: 10000 })
        await quoteBtn.click()
        await page.waitForTimeout(2000)

        const quoteItem = page.getByText(/cotización|proforma|proforma/i).first()
        expect(await quoteItem.isVisible().catch(() => false)).toBeTruthy()
    })
})
