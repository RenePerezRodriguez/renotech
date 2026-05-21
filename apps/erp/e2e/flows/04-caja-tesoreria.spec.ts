import { test, expect } from '@playwright/test'
import { login, expectPageOk } from '../helpers'

const CAJERO = { email: 'rene_perez@outlook.it', password: 'RaPr9392542' }
const GERENTE = { email: 'rene_perez@safesoft.tech', password: 'RaPr9392542' }

// ═══════════════════════════════════════════════════════════════════════════════
// Caja - Flujo completo de caja para cajero
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Caja - Flujo de caja para cajero', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, CAJERO)
        await page.goto('/caja', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Cajero abre modal de nuevo movimiento y lo cierra', async ({ page }) => {
        await expectPageOk(page)
        const newMovement = page.getByRole('button', { name: /nuevo movimiento|movimiento|nuevo/i }).first()
        await expect(newMovement).toBeVisible({ timeout: 10000 })
        await newMovement.click()
        await page.waitForTimeout(1500)

        const modalTitle = page.getByText(/movimiento|nuevo ingreso|nuevo gasto/i).first()
        expect(await modalTitle.isVisible().catch(() => false)).toBeTruthy()

        const cancelButton = page.getByRole('button', { name: /cancelar|cerrar/i }).first()
        if (await cancelButton.isVisible().catch(() => false)) {
            await cancelButton.click()
            await page.waitForTimeout(1000)
        }
    })

    test('Cajero abre modal de gasto operativo y comprueba formulario', async ({ page }) => {
        const expenseButton = page.getByRole('button', { name: /gasto|egreso/i }).first()
        await expect(expenseButton).toBeVisible({ timeout: 10000 })
        await expenseButton.click()
        await page.waitForTimeout(1500)

        const expenseModal = page.getByText(/gasto|egreso operativo/i).first()
        expect(await expenseModal.isVisible().catch(() => false)).toBeTruthy()

        const amountField = page.getByPlaceholder(/monto|importe|cantidad/i).first()
        expect(await amountField.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Caja - Flujo de gerente para control de sesiones
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Caja - Control de sesión GERENTE', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/caja', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Gerente abre historial de sesiones y filtra por sucursal', async ({ page }) => {
        await expectPageOk(page)
        const branchFilter = page.getByLabel(/sucursal|filtrar/i).first()
        if (await branchFilter.isVisible().catch(() => false)) {
            await branchFilter.click()
            await page.waitForTimeout(1000)
            const option = page.getByRole('option').first()
            if (option) {
                await option.click()
                await page.waitForTimeout(1500)
            }
        }

        const historyRow = page.getByText(/sucursal|sesión/i).first()
        expect(await historyRow.isVisible().catch(() => false)).toBeTruthy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Tesorería - Flujo de transferencia bancaria
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('Tesorería - Transferencias', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/tesoreria', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(3000)
    })

    test('Gerente abre formulario de transferencia y verifica campos', async ({ page }) => {
        await expectPageOk(page)
        const transferButton = page.getByRole('button', { name: /transferencia|transferir|transfer/i }).first()
        await expect(transferButton).toBeVisible({ timeout: 10000 })
        await transferButton.click()
        await page.waitForTimeout(1500)

        const fromAccount = page.getByLabel(/desde|origen/i).first()
        const toAccount = page.getByLabel(/hasta|destino/i).first()
        expect(await fromAccount.isVisible().catch(() => false)).toBeTruthy()
        expect(await toAccount.isVisible().catch(() => false)).toBeTruthy()
    })
})
