import { test, expect } from '@playwright/test'
import { getFirstVisibleLocator, getVisibleHeading, login, expectPageOk, fillSearch, openGlobalSearch, GERENTE } from '../helpers'

const pagesToCover = [
    { href: '/sucursales', title: /Sucursales/i },
    { href: '/configuracion/sucursales', title: /Sucursales/i },
    { href: '/inventario/nuevo', title: /Nuevo|Crear|Agregar/i },
    { href: '/transportes', title: /Transportes/i },
    { href: '/envios', title: /Envíos|Envios/i },
    { href: '/pedidos', title: /Pedidos/i },
    { href: '/compras', title: /Compras/i },
    { href: '/cotizaciones', title: /Cotizaciones/i },
    { href: '/clientes', title: /Clientes/i },
    { href: '/creditos', title: /Créditos|Creditos/i },
    { href: '/gerencia', title: /Gerencia/i },
    { href: '/tesoreria', title: /Tesorería|Tesoreria/i },
    { href: '/auditoria', title: /Auditoría|Auditoria/i },
    { href: '/estadisticas', title: /Estadísticas|Estadisticas|Inteligencia de Negocio/i },
    { href: '/usuarios', title: /Usuarios/i },
    { href: '/configuracion', title: /Configuración|Configuracion/i },
]

// ═══════════════════════════════════════════════════════════════════════════════
// Sistema - Rutas principales y páginas faltantes
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('09. Cobertura de sistema completa', () => {
    test('Carga todas las páginas principales del menú', async ({ page }) => {
        await login(page, GERENTE)

        for (const pageInfo of pagesToCover) {
            await page.goto(pageInfo.href, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await expectPageOk(page)
            const pageTitle = await getVisibleHeading(page, pageInfo.title)
            await expect(pageTitle).toBeVisible({ timeout: 30000 })
        }
    })

    test('Carga inventario nuevo y valida campos del formulario', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/inventario/nuevo', { waitUntil: 'domcontentloaded', timeout: 60000 })
        await expectPageOk(page)

        const warning = page.getByText(/Solo la Sede Central puede crear nuevos repuestos/i)
        if (await warning.count()) {
            await expect(warning.first()).toBeVisible({ timeout: 10000 })
            return
        }

        const inventoryTitle = page.getByRole('heading', { name: /Gestión de Activos|Nuevo Repuesto/i })
        await expect(inventoryTitle.first()).toBeVisible({ timeout: 15000 })
        await expect(page.getByPlaceholder(/Ej\. Kit de Embrague Renault Logan 1\.6/i)).toBeVisible({ timeout: 10000 })
        await expect(page.getByPlaceholder(/RT-000/i)).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('button', { name: /Guardar|Crear|Agregar/i })).toBeVisible({ timeout: 10000 })
    })

    test('Carga configuracion/sucursales y abre el modal de nueva sucursal', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/configuracion/sucursales', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByText(/Sucursales/i).first()).toBeVisible({ timeout: 15000 })
        const newBranchBtn = page.getByRole('button', { name: /Nueva Sucursal/i }).first()
        await expect(newBranchBtn).toBeVisible({ timeout: 10000 })
        await newBranchBtn.click()
        await page.waitForTimeout(1000)
        await expect(page.getByText(/Guardar|Nombre|Código/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga compras/nueva y valida catálogo y carrito', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/compras/nueva', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByPlaceholder(/Buscar por nombre, código o referencia/i)).toBeVisible({ timeout: 15000 })
        await expect(page.getByRole('button', { name: /Nuevo/i }).first()).toBeVisible({ timeout: 15000 })
    })

    test('Carga cotizaciones/nueva y verifica búsqueda de productos', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/cotizaciones/nueva', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByPlaceholder(/Buscar producto por nombre o código/i)).toBeVisible({ timeout: 15000 })
        await page.keyboard.press('F2')
        await page.waitForTimeout(500)
        const searchInput = page.getByPlaceholder(/Buscar producto por nombre o código/i)
        await expect(searchInput).toBeVisible({ timeout: 10000 })
    })

    test('Carga pedidos/nuevo y valida catálogo, carrito y botones de guardado', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/pedidos/nuevo', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByRole('heading', { name: /Nuevo pedido/i }).first()).toBeVisible({ timeout: 15000 })
        await expect(page.getByPlaceholder(/Buscar por nombre, código u OE/i)).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('button', { name: /Guardar borrador|Guardar y validar|Guardar/i }).first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga envios/nuevo y valida el modo directo de envío', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/envios/nuevo', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(await getFirstVisibleLocator(page.getByText(/Nuevo envío/i))).toBeVisible({ timeout: 15000 })
        await expect(await getFirstVisibleLocator(page.getByText(/Transporte/i))).toBeVisible({ timeout: 10000 })
        await expect(await getFirstVisibleLocator(page.getByPlaceholder(/Buscar producto en mi sucursal/i))).toBeVisible({ timeout: 10000 })
    })

    test('Carga kardex profundo y navega a ficha completa del producto', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/kardex', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        const firstProduct = page.locator('a[href^="/kardex/"]').first()
        if (await firstProduct.count()) {
            await expect(firstProduct).toBeVisible({ timeout: 10000 })
            await firstProduct.click()
            await page.waitForTimeout(1500)
            await expect(page.getByText(/Kardex|Movimientos|Historial completo/i).first()).toBeVisible({ timeout: 15000 })
        } else {
            await expect(page.getByText(/Kardex/i).first()).toBeVisible({ timeout: 10000 })
        }
    })

    test('Abre pedido desde la lista de pedidos y valida detalle', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/pedidos', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        const orderLink = page.locator('a[href^="/pedidos/"]').first()
        if (await orderLink.count()) {
            await expect(orderLink).toBeVisible({ timeout: 10000 })
            await orderLink.click()
            await page.waitForTimeout(1500)
            await expect(page.getByText(/Pedido|Detalle de Pedido|Exportar/i).first()).toBeVisible({ timeout: 15000 })
        } else {
            await expect(page.getByText(/Pedidos/i).first()).toBeVisible({ timeout: 10000 })
        }
    })

    test('Abre envío desde la lista de envíos y valida detalle', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/envios', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        const envioLink = page.locator('a[href^="/envios/"]').first()
        if (await envioLink.count()) {
            await expect(envioLink).toBeVisible({ timeout: 10000 })
            await envioLink.click()
            await page.waitForTimeout(1500)
            await expect(page.getByText(/Envío|Envíos|Recibido|En tránsito/i).first()).toBeVisible({ timeout: 15000 })
        } else {
            await expect(page.getByText(/Envíos/i).first()).toBeVisible({ timeout: 10000 })
        }
    })

    test('Carga verificar/[id] con ID inválido y muestra mensaje de no encontrado', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/verificar/INVALID-ID-000', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        const noFound = page.getByText(/no se encontró|no existe|sin resultados|404/i)
        if (await noFound.count()) {
            await expect(noFound.first()).toBeVisible({ timeout: 10000 })
        } else {
            await expect(page.getByText(/Historial/i).first()).not.toBeVisible()
        }
    })

    test('Abre búsqueda global con botón y verifica el comportamiento de ESC', async ({ page }) => {
        await login(page, GERENTE)
        await openGlobalSearch(page)
        await fillSearch(page, 'FEB-026')

        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
        const globalSearchInput = page.getByPlaceholder(/Buscar por nombre, código, marca, categoría…/i)
        expect(await globalSearchInput.isVisible().catch(() => false)).toBeFalsy()
    })
})
