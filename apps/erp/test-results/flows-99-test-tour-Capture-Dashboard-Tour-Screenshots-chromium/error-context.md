# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: flows\99-test-tour.spec.ts >> Capture Dashboard Tour Screenshots
- Location: e2e\flows\99-test-tour.spec.ts:4:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByPlaceholder('usuario@renotech.com')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
    - img [ref=e8]
  - alert [ref=e11]
  - generic [ref=e13]:
    - generic [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e18]:
          - img "Renotech" [ref=e20]
          - heading "RENOTECH" [level=2] [ref=e21]
        - paragraph [ref=e24]: Sistema de Gestión Empresarial
        - heading "Control Total de tu Negocio." [level=1] [ref=e25]:
          - text: Control
          - text: Total
          - text: de tu
          - text: Negocio.
        - paragraph [ref=e26]: Inventario, ventas, créditos y reportes integrados en una sola plataforma de alto rendimiento.
        - generic [ref=e27]:
          - generic [ref=e28]:
            - generic [ref=e29]:
              - img [ref=e30]
              - generic [ref=e32]: Alta velocidad
            - generic [ref=e33]: < 1s
          - generic [ref=e34]:
            - generic [ref=e35]:
              - img [ref=e36]
              - generic [ref=e39]: Uptime
            - generic [ref=e40]: 99.9%
          - generic [ref=e41]:
            - generic [ref=e42]:
              - img [ref=e43]
              - generic [ref=e46]: Seguridad
            - generic [ref=e47]: ISO 27001
        - generic [ref=e48]:
          - generic [ref=e49]:
            - img [ref=e51]
            - generic [ref=e55]:
              - paragraph [ref=e56]: Inventario
              - paragraph [ref=e57]: Control en tiempo real
          - generic [ref=e58]:
            - img [ref=e60]
            - generic [ref=e64]:
              - paragraph [ref=e65]: Ventas
              - paragraph [ref=e66]: POS y cotizaciones
          - generic [ref=e67]:
            - img [ref=e69]
            - generic [ref=e71]:
              - paragraph [ref=e72]: Reportes
              - paragraph [ref=e73]: Analítica avanzada
          - generic [ref=e74]:
            - img [ref=e76]
            - generic [ref=e81]:
              - paragraph [ref=e82]: Clientes
              - paragraph [ref=e83]: CRM y créditos
      - generic [ref=e84]:
        - paragraph [ref=e85]: © 2025 Renotech · Todos los derechos reservados
        - generic [ref=e86]:
          - img [ref=e87]
          - paragraph [ref=e90]:
            - text: Desarrollado y diseñado por
            - link "safesoft.tech" [ref=e91] [cursor=pointer]:
              - /url: https://safesoft.tech
            - text: ·
            - link "desarrollowebbolivia.com" [ref=e92] [cursor=pointer]:
              - /url: https://desarrollowebbolivia.com
    - generic [ref=e95]:
      - generic [ref=e96]:
        - paragraph [ref=e99]: Inicio de sesión
        - heading "Bienvenido de vuelta" [level=1] [ref=e100]:
          - text: Bienvenido
          - text: de vuelta
        - paragraph [ref=e101]: Ingresa tus credenciales para continuar
      - generic [ref=e103]:
        - generic [ref=e104]:
          - generic [ref=e105]: Correo Electrónico
          - generic [ref=e106]:
            - generic:
              - img
            - textbox "usuario@empresa.com" [ref=e107]
        - generic [ref=e108]:
          - generic [ref=e109]: Contraseña
          - generic [ref=e110]:
            - generic:
              - img
            - textbox "••••••••••••" [ref=e111]
            - button [ref=e112]:
              - img [ref=e113]
        - button "Iniciar Sesión" [ref=e116]:
          - img [ref=e117]
          - text: Iniciar Sesión
      - generic [ref=e120]:
        - img [ref=e121]
        - generic [ref=e124]: Conexión segura · Acceso Restringido
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { expect, type Locator, type Page } from '@playwright/test'
  2  | 
  3  | export const GERENTE = { email: 'rene_perez@safesoft.tech', password: 'RaPr9392542' }
  4  | export const CAJERO = { email: 'rene_perez@outlook.it', password: 'RaPr9392542' }
  5  | 
  6  | export async function getFirstVisibleLocator(locator: Locator) {
  7  |     const count = await locator.count()
  8  |     for (let i = 0; i < count; i += 1) {
  9  |         const item = locator.nth(i)
  10 |         if (await item.isVisible()) {
  11 |             return item
  12 |         }
  13 |     }
  14 |     return locator.first()
  15 | }
  16 | 
  17 | export async function getVisibleHeading(page: Page, title: RegExp | string) {
  18 |     const heading = page.locator('h1, h2, h3, h4', { hasText: title })
  19 |     if (await heading.count() > 0) {
  20 |         return await getFirstVisibleLocator(heading)
  21 |     }
  22 | 
  23 |     const fallback = page.getByText(title)
  24 |     return await getFirstVisibleLocator(fallback)
  25 | }
  26 | 
  27 | export async function login(page: Page, credentials: typeof GERENTE) {
  28 |     await page.goto('/acceso')
> 29 |     await page.getByPlaceholder('usuario@renotech.com').fill(credentials.email)
     |                                                         ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  30 |     await page.getByPlaceholder('••••••••').fill(credentials.password)
  31 |     await page.getByRole('button', { name: 'Iniciar Sesión' }).click()
  32 |     await page.waitForTimeout(4000)
  33 | }
  34 | 
  35 | export async function expectPageOk(page: Page) {
  36 |     await expect(page.locator('body')).not.toContainText('Application error')
  37 |     await expect(page.locator('body')).not.toContainText('404')
  38 |     await expect(page.locator('body')).not.toContainText('500 Internal Server Error')
  39 | }
  40 | 
  41 | export async function fillSearch(page: Page, term: string) {
  42 |     const inputLocator = page.getByPlaceholder(/Buscar por nombre, código, marca, categoría…|Buscar por nombre, código o referencia\.{3}|Buscar producto por nombre o código\.{3}/i)
  43 |     const input = await getFirstVisibleLocator(inputLocator)
  44 |     await expect(input).toBeVisible({ timeout: 10000 })
  45 |     await input.fill(term)
  46 |     await page.waitForTimeout(1500)
  47 | }
  48 | 
  49 | export async function openGlobalSearch(page: Page) {
  50 |     const searchButton = page.getByRole('button', { name: /Buscar/i }).first()
  51 |     if (await searchButton.count()) {
  52 |         await expect(searchButton).toBeVisible({ timeout: 10000 })
  53 |         await searchButton.click()
  54 |     } else {
  55 |         await page.keyboard.press('Control+k')
  56 |     }
  57 |     await page.waitForTimeout(500)
  58 | }
  59 | 
  60 | export async function clickButtonByLabel(page: Page, label: RegExp | string) {
  61 |     const button = page.getByRole('button', { name: label })
  62 |     await expect(button).toBeVisible({ timeout: 10000 })
  63 |     await button.click()
  64 |     await page.waitForTimeout(1000)
  65 | }
  66 | 
```