import { test, expect } from '@playwright/test'
import { login, expectPageOk, fillSearch } from '../helpers'

const GERENTE = { email: 'rene_perez@safesoft.tech', password: 'RaPr9392542' }

// ═══════════════════════════════════════════════════════════════════════════════
// Compras - Flujo de compras y nuevo pedido
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Compras - Flujo de compras', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/compras', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Abre lista de compras y navega a nueva compra', async ({ page }) => {
        await expectPageOk(page)
        const newPurchase = page.getByRole('link', { name: /nueva compra|nuevo|comprar/i }).first()
        await expect(newPurchase).toBeVisible({ timeout: 10000 })
        await newPurchase.click()
        await page.waitForTimeout(2000)
        await expectPageOk(page)

        const supplierField = page.getByLabel(/proveedor|empresa/i).first()
        expect(await supplierField.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Compras - Crear nueva compra con búsqueda de producto
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Compras - Nueva compra', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/compras/nueva', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Busca producto, selecciona proveedor y agrega al carrito', async ({ page }) => {
        await expectPageOk(page)
        await fillSearch(page, 'FEB-026')
        const product = page.getByText(/FEB-026/i).first()
        await expect(product).toBeVisible({ timeout: 10000 })
        await product.click()
        await page.waitForTimeout(1500)

        const supplier = page.getByText(/proveedor|empresa/i).first()
        expect(await supplier.isVisible().catch(() => false)).toBeTruthy()

        const cartTotal = page.getByText(/total|subtotal|importe/i).first()
        expect(await cartTotal.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Ventas - Historial y detalle de venta
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Ventas - Flujo de ventas', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/ventas', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Busca una venta y abre el detalle', async ({ page }) => {
        await expectPageOk(page)
        const searchInput = page.getByPlaceholder(/buscar|número|cliente/i).first()
        await expect(searchInput).toBeVisible({ timeout: 10000 })
        await searchInput.fill('REN-')
        await page.waitForTimeout(1500)

        const row = page.locator('tr, [role="row"]').nth(1)
        await expect(row).toBeVisible({ timeout: 10000 })
        await row.click()
        await page.waitForTimeout(2000)

        const detailHeader = page.getByText(/detalle de venta|venta/i).first()
        expect(await detailHeader.isVisible().catch(() => false)).toBeTruthy()
    })

    test('Abre detalle de venta y verifica acciones de impresión o anulado', async ({ page }) => {
        const firstSale = page.locator('tr, [role="row"]').nth(1)
        if (await firstSale.isVisible().catch(() => false)) {
            await firstSale.click()
            await page.waitForTimeout(2000)
        }

        const printButton = page.getByRole('button', { name: /imprimir|recibo/i }).first()
        expect(await printButton.isVisible().catch(() => false)).toBeTruthy()

        const voidButton = page.getByRole('button', { name: /anular|cancelar/i }).first()
        expect(await voidButton.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Kardex - Búsqueda y detalle de producto
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Kardex - Flujo de existencias', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/kardex', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Busca producto FEB-026 y abre el kardex', async ({ page }) => {
        await expectPageOk(page)
        await fillSearch(page, 'FEB-026')
        const product = page.getByText(/FEB-026/i).first()
        await expect(product).toBeVisible({ timeout: 10000 })
        await product.click()
        await page.waitForTimeout(2000)

        const movementHeader = page.getByText(/movimientos|kardex/i).first()
        expect(await movementHeader.isVisible().catch(() => false)).toBeTruthy()
    })

    test('Abre filtro de tipo de movimiento', async ({ page }) => {
        const typeFilter = page.getByText(/entrada|salida|ajuste/i).first()
        if (await typeFilter.isVisible().catch(() => false)) {
            await typeFilter.click()
            await page.waitForTimeout(1000)
        }
        expect(await typeFilter.isVisible().catch(() => false)).toBeTruthy()
    })
})
