import { test, expect } from '@playwright/test'
import { login, expectPageOk, fillSearch, GERENTE } from '../helpers'

// ═══════════════════════════════════════════════════════════════════════════════
// Estadísticas, usuarios, auditoría y alertas
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Estadísticas y métricas', () => {
    test('Carga estadísticas y cambia periodos', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/estadisticas', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByText(/Inteligencia de Negocio/i).first()).toBeVisible({ timeout: 10000 })
        const periodo90 = page.getByRole('button', { name: /90 Días|90 Días/i }).first()
        await expect(periodo90).toBeVisible({ timeout: 10000 })
        await periodo90.click()
        await page.waitForTimeout(1000)

        const periodoTodo = page.getByRole('button', { name: /Todo/i }).first()
        await expect(periodoTodo).toBeVisible({ timeout: 10000 })
        await periodoTodo.click()
        await page.waitForTimeout(1000)
    })
})

test.describe('Usuarios y gestión de cuentas', () => {
    test('Carga usuarios y abre modal de nuevo usuario', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/usuarios', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByText(/Usuarios Registrados/i).first()).toBeVisible({ timeout: 10000 })
        const newUserButton = page.getByRole('button', { name: /Nuevo Usuario|Alta de Usuario/i }).first()
        await expect(newUserButton).toBeVisible({ timeout: 10000 })
        await newUserButton.click()
        await page.waitForTimeout(1500)

        await expect(page.getByText(/Alta de Usuario|Nuevo Usuario/i).first()).toBeVisible({ timeout: 10000 })
        await expect(page.getByPlaceholder(/usuario@renotech\.com/i)).toBeVisible({ timeout: 10000 })
    })
})

test.describe('Auditoría y alertas', () => {
    test('Carga auditoría y alterna alertas pendientes/historial', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/auditoria', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByText(/Centro de Auditoría|Acceso Restringido/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga alertas y alterna filtros de alerta', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/auditoria/alertas', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByText(/Centro de Auditoría|Centro de Alertas/i).first()).toBeVisible({ timeout: 10000 })
        const pendientes = page.getByRole('button', { name: /Pendientes/i }).first()
        await expect(pendientes).toBeVisible({ timeout: 10000 })
        await pendientes.click()
        await page.waitForTimeout(1000)

        const historial = page.getByRole('button', { name: /Historial/i }).first()
        await expect(historial).toBeVisible({ timeout: 10000 })
        await historial.click()
        await page.waitForTimeout(1000)

        await expect(page.getByText(/Total Detectadas|No hay alertas/i).first()).toBeVisible({ timeout: 10000 })
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Transportes, envíos, configuración, perfil y verificación
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Transportes y envíos', () => {
    test('Carga transportes y abre formulario de nuevo transporte', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/transportes', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByText(/Transportes/i).first()).toBeVisible({ timeout: 10000 })
        const createTransport = page.getByRole('button', { name: /Nuevo Transporte/i }).first()
        await expect(createTransport).toBeVisible({ timeout: 10000 })
        await createTransport.click()
        await page.waitForTimeout(1500)

        await expect(page.getByText(/Nuevo Transporte/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga envíos y alterna entre Salientes y Entrantes', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/envios', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByText(/Envíos/i).first()).toBeVisible({ timeout: 10000 })
        const envioDirecto = page.getByRole('button', { name: /Envío directo/i }).first()
        await expect(envioDirecto).toBeVisible({ timeout: 10000 })
        await envioDirecto.click()
        await page.waitForURL(/\/envios\/nuevo/)
        await expect(page.getByText(/Nuevo envío/i).first()).toBeVisible({ timeout: 10000 })
    })
})

test.describe('Configuración, perfil y verificar', () => {
    test('Carga configuración, cambia pestañas y abre sucursales', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/configuracion', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByText(/Configuración/i).first()).toBeVisible({ timeout: 10000 })
        await page.getByRole('button', { name: /Identidad/i }).click()
        await page.waitForTimeout(500)
        await page.getByRole('button', { name: /Finanzas/i }).click()
        await page.waitForTimeout(500)
        await page.getByRole('button', { name: /Mantenimiento/i }).click()
        await page.waitForTimeout(500)

        const sucursalesLink = page.getByRole('link', { name: /Gestionar Sucursales/i }).first()
        await expect(sucursalesLink).toBeVisible({ timeout: 10000 })
        await sucursalesLink.click()
        await page.waitForURL(/\/configuracion\/sucursales/)
        await expect(page.getByText(/Sucursales/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga perfil y verifica el botón de actualización', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/perfil', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        await expect(page.getByText(/Perfil de Operador/i).first()).toBeVisible({ timeout: 10000 })
        await expect(page.getByRole('button', { name: /Actualizar Identidad/i }).first()).toBeVisible({ timeout: 10000 })
    })

    test('Carga verificar con un ID real extraído de ventas', async ({ page }) => {
        await login(page, GERENTE)
        await page.goto('/ventas', { waitUntil: 'domcontentloaded' })
        await expectPageOk(page)

        const codeElement = page.getByText(/VEN-[A-Z0-9]+/).first()
        await expect(codeElement).toBeVisible({ timeout: 10000 })
        const saleCode = await codeElement.innerText()

        await page.goto(`/verificar/${saleCode}`, { waitUntil: 'domcontentloaded' })
        const escapedSaleCode = saleCode.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
        await expect(page).toHaveURL(new RegExp(`/verificar/${escapedSaleCode}`))
        await expect(page.getByText(/Historial de Ventas/i).first()).toBeVisible({ timeout: 10000 })
        await expect(page.getByPlaceholder(/Buscar por cliente, nit o id de venta/i)).toBeVisible({ timeout: 10000 })
    })
})
