import { test, expect } from '@playwright/test'
import { login, expectPageOk, fillSearch } from '../helpers'

const GERENTE = { email: 'rene_perez@safesoft.tech', password: 'RaPr9392542' }

// ═══════════════════════════════════════════════════════════════════════════════
// Clientes - Búsqueda y creación de cliente
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Clientes - Flujo de clientes', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/clientes', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Busca un cliente y abre el formulario de nuevo cliente', async ({ page }) => {
        await expectPageOk(page)
        await fillSearch(page, 'test')

        const newClient = page.getByRole('button', { name: /nuevo cliente|crear cliente|nuevo/i }).first()
        await expect(newClient).toBeVisible({ timeout: 10000 })
        await newClient.click()
        await page.waitForTimeout(2000)

        const nameField = page.getByPlaceholder(/nombre|razón social|cliente/i).first()
        expect(await nameField.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Proveedores - Flujo de proveedores
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Proveedores - Flujo de proveedores', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/proveedores', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Busca proveedor y navega a nueva empresa', async ({ page }) => {
        await expectPageOk(page)
        await fillSearch(page, 'test')

        const newSupplier = page.getByRole('button', { name: /nueva empresa|crear empresa|nuevo/i }).first()
        await expect(newSupplier).toBeVisible({ timeout: 10000 })
        await newSupplier.click()
        await page.waitForTimeout(2000)

        const companyField = page.getByPlaceholder(/empresa|razón social|nombre/i).first()
        expect(await companyField.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Cotizaciones - Listado y nueva cotización
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Cotizaciones - Flujo de cotizaciones', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/cotizaciones', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Abre nueva cotización y comprueba campos', async ({ page }) => {
        await expectPageOk(page)
        const newQuote = page.getByRole('link', { name: /nueva cotización|nuevo/i }).first()
        await expect(newQuote).toBeVisible({ timeout: 10000 })
        await newQuote.click()
        await page.waitForTimeout(2000)

        const clientField = page.getByLabel(/cliente|cliente/i).first()
        const productSearch = page.getByPlaceholder(/buscar|producto/i).first()
        expect(await clientField.isVisible().catch(() => false)).toBeTruthy()
        expect(await productSearch.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Pedidos - Flujo de pedidos
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Pedidos - Flujo de pedidos', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/pedidos', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Navega a nuevo pedido y verifica formulario', async ({ page }) => {
        await expectPageOk(page)
        const newOrder = page.getByRole('link', { name: /nuevo pedido|nuevo/i }).first()
        await expect(newOrder).toBeVisible({ timeout: 10000 })
        await newOrder.click()
        await page.waitForTimeout(2000)

        const orderClient = page.getByPlaceholder(/cliente|empresa/i).first()
        const orderDate = page.getByPlaceholder(/fecha|vencimiento/i).first()
        expect(await orderClient.isVisible().catch(() => false)).toBeTruthy()
        expect(await orderDate.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Créditos - Lista y pago
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Créditos - Flujo de créditos', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/creditos', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Abre crédito y verifica acción de pago', async ({ page }) => {
        await expectPageOk(page)
        const firstCredit = page.locator('tr, [role="row"]').nth(1)
        if (await firstCredit.isVisible().catch(() => false)) {
            await firstCredit.click()
            await page.waitForTimeout(2000)
        }

        const payButton = page.getByRole('button', { name: /pago|registrar/i }).first()
        expect(await payButton.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Gerencia - Aprobaciones funcionales
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Gerencia - Flujo de aprobaciones', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/gerencia', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Navega por pestañas de gerencia y comprueba contenido', async ({ page }) => {
        await expectPageOk(page)
        const tabs = [
            /gastos pendientes|gastos/i,
            /anulaciones pendientes|anulación|devolución/i,
            /descuentos pendientes|descuento/i,
            /discrepancias/i,
            /cancelaciones pendientes|cancelación/i,
        ]

        for (const tabRegex of tabs) {
            const tab = page.getByText(tabRegex).first()
            if (await tab.isVisible().catch(() => false)) {
                await tab.click()
                await page.waitForTimeout(1000)
                expect(await tab.isVisible().catch(() => false)).toBeTruthy()
            }
        }
    })
})
