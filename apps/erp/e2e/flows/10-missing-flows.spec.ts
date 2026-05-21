import { test, expect } from '@playwright/test'
import { login, expectPageOk, getFirstVisibleLocator, GERENTE } from '../helpers'

// ═══════════════════════════════════════════════════════════════════════════════
// Flujos críticos faltantes para cobertura completa
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Flujos críticos faltantes', () => {
    test('Carga inventario nuevo y valida el formulario completo', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/inventario/nuevo', { waitUntil: 'domcontentloaded', timeout: 60000 })
        await expectPageOk(page)

        const warning = page.getByText(/Solo la Sede Central puede crear nuevos repuestos/i)
        if (await warning.count()) {
            await expect(warning.first()).toBeVisible({ timeout: 10000 })
            return
        }

        await expect(page.getByRole('heading', { name: /Gestión de Activos|Nuevo Repuesto/i }).first()).toBeVisible({ timeout: 15000 })
        await expect(page.getByPlaceholder(/Ej\. Kit de Embrague Renault Logan 1\.6/i)).toBeVisible({ timeout: 10000 })
        await expect(page.getByPlaceholder(/RT-000/i)).toBeVisible({ timeout: 10000 })
        await expect(page.getByPlaceholder(/Original Equipment Manufacturer/i).first()).toBeVisible({ timeout: 10000 })
        await expect(page.getByText(/Registrar Nuevo|Guardar Cambios/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga compras/nueva y valida búsqueda de inventario', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/compras/nueva', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByPlaceholder(/Buscar por nombre, código o referencia/i).first()).toBeVisible({ timeout: 15000 })
        await expect(page.getByRole('button', { name: /Nuevo|Agregar|Crear/i }).first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga cotizaciones/nueva y comprueba búsqueda por F2', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/cotizaciones/nueva', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByPlaceholder(/Buscar producto por nombre o código/i)).toBeVisible({ timeout: 15000 })
        await page.keyboard.press('F2')
        await page.waitForTimeout(500)
        const searchInput = await getFirstVisibleLocator(page.getByPlaceholder(/Buscar producto por nombre o código/i))
        await expect(searchInput).toBeVisible({ timeout: 10000 })
    })

    test('Carga pedidos/nuevo y valida selección de sucursal y catálogo', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/pedidos/nuevo', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByRole('heading', { name: /Nuevo pedido/i }).first()).toBeVisible({ timeout: 15000 })
        await expect(page.getByPlaceholder(/Buscar por nombre, código u OE/i).first()).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('combobox').first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga envíos/nuevo y valida el modo directo de envío', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/envios/nuevo', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByRole('heading', { name: /Nuevo envío/i }).first()).toBeVisible({ timeout: 15000 })
        await expect(page.getByPlaceholder(/Buscar producto en mi sucursal/i).first()).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('button', { name: /Crear envío en preparación/i }).first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga configuracion/sucursales y abre el modal de nueva sucursal', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/configuracion/sucursales', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        const newBranchBtn = page.getByRole('button', { name: /Nueva Sucursal/i }).first()
        await expect(newBranchBtn).toBeVisible({ timeout: 15000 })
        await newBranchBtn.click()
        await page.waitForTimeout(1000)

        await expect(page.getByText(/Nombre|Dirección|Teléfono/i).first()).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('button', { name: /Guardar|Crear/i }).first()).toBeVisible({ timeout: 10000 })
    })
})
