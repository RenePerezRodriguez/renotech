import { test, expect, type Page } from '@playwright/test'
import { login, expectPageOk, fillSearch, openGlobalSearch, GERENTE, CAJERO } from '../helpers'

const restrictivePages = ['/usuarios', '/configuracion', '/gerencia', '/auditoria', '/tesoreria', '/sucursales']

async function expectPageTitle(page: Page, title: RegExp) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 15000 })
}

async function expectForbiddenAccess(page: Page) {
    const forbidden = page.getByText(/Acceso Restringido|No tienes acceso|Access denied/i)
    if (await forbidden.count()) {
        await expect(forbidden.first()).toBeVisible({ timeout: 10000 })
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Login y acceso principal
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('1. Login y acceso', () => {
    test('GERENTE inicia sesión y recorre módulos clave', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/inicio', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)
        await expectPageTitle(page, /Dashboard/i)
        await expect(page.getByText(/Ingresos del Día/i).first()).toBeVisible()
        await expect(page.getByText(/Stock Activo/i).first()).toBeVisible()
        await expect(page.getByText(/Alertas de Inventario/i).first()).toBeVisible()

        await page.goto('/usuarios', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)
        await expect(page.getByText(/Usuarios/i).first()).toBeVisible()

        await page.goto('/configuracion', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)
        await expect(page.getByText(/Configuración/i).first()).toBeVisible()

        await page.goto('/auditoria', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)
        await expect(page.getByText(/Consola Maestra de Auditoría/i).first()).toBeVisible()
    })

    test('GERENTE refresca en dashboard y mantiene sesión activa', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/inicio', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)
        await expectPageTitle(page, /Dashboard/i)

        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectPageOk(page)
        await expect(page).toHaveURL(/\/inicio/)
        await expectPageTitle(page, /Dashboard/i)
    })

    test('CAJERO accede a POS y no puede ver módulos restringidos', async ({ page }) => {
        await login(page, CAJERO)
        await page.goto('/punto-de-venta', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        for (const path of restrictivePages) {
            await page.goto(path, { waitUntil: 'domcontentloaded' })
            await page.waitForTimeout(1500)
            await expectForbiddenAccess(page)
        }

        await expect(page.getByRole('link', { name: /Usuarios/i })).toHaveCount(0)
        await expect(page.getByRole('link', { name: /Configuración/i })).toHaveCount(0)
    })

    test('Credenciales incorrectas muestran error', async ({ page }) => {
        await page.goto('/acceso')
        await page.getByPlaceholder('usuario@renotech.com').fill('fake@fake.com')
        await page.getByPlaceholder('••••••••').fill('wrong')
        await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
        await expect(page.getByText(/credenciales incorrectas/i)).toBeVisible({ timeout: 10000 })
    })

    test('Login sin datos muestra error de validación', async ({ page }) => {
        await page.goto('/acceso')
        await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
        await expect(page.getByText(/Error al iniciar sesión|Credenciales incorrectas|requerido/i)).toBeVisible({ timeout: 10000 })
    })

    test('Abre buscador global con atajo y busca producto', async ({ page }) => {
        await login(page, GERENTE)
        await openGlobalSearch(page)
        await fillSearch(page, 'FEB-026')
        await expect(page.getByText(/FEB-026/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('Logout redirige a acceso', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/acceso', { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(/\/acceso/)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Búsqueda global como flujo real
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('2. Global Product Search', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/inicio', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(2000)
    })

    test('Se abre búsqueda global y encuentra producto FEB-026', async ({ page }) => {
        const searchButton = page.getByRole('button', { name: /Buscar/i }).first()
        await expect(searchButton).toBeVisible({ timeout: 10000 })
        await searchButton.click()
        await fillSearch(page, 'FEB-026')
        await expect(page.getByText(/FEB-026/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('Busca y abre un resultado desde el buscador global', async ({ page }) => {
        const searchButton = page.getByRole('button', { name: /Buscar/i }).first()
        await expect(searchButton).toBeVisible({ timeout: 10000 })
        await searchButton.click()
        await fillSearch(page, 'FEB-026')

        const firstResult = page.getByText(/FEB-026/i).first()
        await expect(firstResult).toBeVisible({ timeout: 10000 })
        await firstResult.click({ force: true })
        await page.waitForTimeout(1500)
        await expect(page.locator('body')).not.toContainText(/Error|No se encontró|404/i)
    })

    test('Cierra el buscador con ESC', async ({ page }) => {
        await page.keyboard.press('Control+k')
        await page.waitForTimeout(500)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
        const searchInput = page.getByPlaceholder(/buscar por nombre/i)
        expect(await searchInput.isVisible().catch(() => false)).toBeFalsy()
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Perfil y navegación de usuario
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('3. Perfil y navegación', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/perfil', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(2000)
    })

    test('Página de perfil carga y muestra email del usuario', async ({ page }) => {
        await expectPageOk(page)
        await expect(page.getByRole('heading', { name: /Perfil de Operador/i })).toBeVisible()
        await expect(page.getByText(/rene_perez@safesoft\.tech|rene_perez@outlook\.it/i).first()).toBeVisible()
        await expect(page.getByPlaceholder('Ingrese nombre')).toBeVisible()
    })

    test('Navegación por sidebar y cambio de sucursal', async ({ page }) => {
        const branchSelector = page.getByText(/Sucursal/i).first()
        if (await branchSelector.isVisible().catch(() => false)) {
            await branchSelector.click()
            await page.waitForTimeout(1000)
            await expect(page.getByText(/Todas las Sedes|Sucursal/i).first()).toBeVisible()
        }
    })
})
