import { expect, type Locator, type Page } from '@playwright/test'

export const GERENTE = { email: 'rene_perez@safesoft.tech', password: 'RaPr9392542' }
export const CAJERO = { email: 'rene_perez@outlook.it', password: 'RaPr9392542' }

export async function getFirstVisibleLocator(locator: Locator) {
    const count = await locator.count()
    for (let i = 0; i < count; i += 1) {
        const item = locator.nth(i)
        if (await item.isVisible()) {
            return item
        }
    }
    return locator.first()
}

export async function getVisibleHeading(page: Page, title: RegExp | string) {
    const heading = page.locator('h1, h2, h3, h4', { hasText: title })
    if (await heading.count() > 0) {
        return await getFirstVisibleLocator(heading)
    }

    const fallback = page.getByText(title)
    return await getFirstVisibleLocator(fallback)
}

export async function login(page: Page, credentials: typeof GERENTE) {
    await page.goto('/acceso')
    await page.getByPlaceholder('usuario@renotech.com').fill(credentials.email)
    await page.getByPlaceholder('••••••••').fill(credentials.password)
    await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
    await page.waitForTimeout(4000)
}

export async function expectPageOk(page: Page) {
    await expect(page.locator('body')).not.toContainText('Application error')
    await expect(page.locator('body')).not.toContainText('404')
    await expect(page.locator('body')).not.toContainText('500 Internal Server Error')
}

export async function fillSearch(page: Page, term: string) {
    const inputLocator = page.getByPlaceholder(/Buscar por nombre, código, marca, categoría…|Buscar por nombre, código o referencia\.{3}|Buscar producto por nombre o código\.{3}/i)
    const input = await getFirstVisibleLocator(inputLocator)
    await expect(input).toBeVisible({ timeout: 10000 })
    await input.fill(term)
    await page.waitForTimeout(1500)
}

export async function openGlobalSearch(page: Page) {
    const searchButton = page.getByRole('button', { name: /Buscar/i }).first()
    if (await searchButton.count()) {
        await expect(searchButton).toBeVisible({ timeout: 10000 })
        await searchButton.click()
    } else {
        await page.keyboard.press('Control+k')
    }
    await page.waitForTimeout(500)
}

export async function clickButtonByLabel(page: Page, label: RegExp | string) {
    const button = page.getByRole('button', { name: label })
    await expect(button).toBeVisible({ timeout: 10000 })
    await button.click()
    await page.waitForTimeout(1000)
}
