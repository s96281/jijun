import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Router } from '../../src/js/router.js'

function createMockApp() {
    return {
        appContainer: { innerHTML: '', classList: { remove: vi.fn(), add: vi.fn() } },
        guideManager: null,
    }
}

// 模擬 DOM nav items
function setupNavItems(pages) {
    document.querySelectorAll('.nav-item').forEach(el => el.remove())
    pages.forEach(page => {
        const item = document.createElement('div')
        item.className = 'nav-item'
        item.dataset.page = page
        document.body.appendChild(item)
    })
}

function clearNavItems() {
    document.querySelectorAll('.nav-item').forEach(el => el.remove())
}

describe('Router', () => {
    let router
    let mockApp

    beforeEach(() => {
        vi.clearAllMocks()
        clearNavItems()
        Object.defineProperty(window, 'location', {
            value: new URL('http://localhost/#home'),
            writable: true,
            configurable: true,
        })
        mockApp = createMockApp()
        router = new Router(mockApp)
    })

    describe('constructor', () => {
        it('應正確初始化 routes 為空物件', () => {
            expect(router.routes).toEqual({})
        })

        it('應儲存 app 引用', () => {
            expect(router.app).toBe(mockApp)
        })

        it('currentHash 初始應為 null', () => {
            expect(router.currentHash).toBeNull()
        })
    })

    describe('register', () => {
        it('應註冊頁面到 routes', () => {
            const mockPage = { render: vi.fn() }
            router.register('home', mockPage)
            expect(router.routes['home']).toBe(mockPage)
        })

        it('可註冊多個頁面', () => {
            const homePage = { render: vi.fn() }
            const settingsPage = { render: vi.fn() }
            router.register('home', homePage)
            router.register('settings', settingsPage)
            expect(router.routes['home']).toBe(homePage)
            expect(router.routes['settings']).toBe(settingsPage)
        })
    })

    describe('handleRouteChange', () => {
        it('應調用對應頁面的 render 方法', async () => {
            const mockPage = { render: vi.fn() }
            router.register('home', mockPage)
            Object.defineProperty(window, 'location', {
                value: new URL('http://localhost/#home'),
                writable: true,
                configurable: true,
            })

            await router.handleRouteChange()
            expect(mockPage.render).toHaveBeenCalled()
        })

        it('應觸發 onRouteChanged 回調', async () => {
            const mockPage = { render: vi.fn() }
            router.register('home', mockPage)
            const onRouteChanged = vi.fn()
            router.onRouteChanged = onRouteChanged
            Object.defineProperty(window, 'location', {
                value: new URL('http://localhost/#home'),
                writable: true,
                configurable: true,
            })

            await router.handleRouteChange()
            expect(onRouteChanged).toHaveBeenCalledWith('home')
        })

        it('應傳遞 URLSearchParams 給 render', async () => {
            Object.defineProperty(window, 'location', {
                value: new URL(
                    'http://localhost/#stats?from=2024-01-01&to=2024-12-31'
                ),
                writable: true,
                configurable: true,
            })

            const capturedParams = {}
            const mockPage = {
                render: vi.fn(params => {
                    capturedParams.params = params
                }),
            }
            router.register('stats', mockPage)

            await router.handleRouteChange()
            expect(capturedParams.params.get('from')).toBe('2024-01-01')
            expect(capturedParams.params.get('to')).toBe('2024-12-31')
        })

        it('當頁面不存在時應導航回 home', async () => {
            const originalHash = window.location.hash
            Object.defineProperty(window, 'location', {
                value: new URL('http://localhost/#nonexistent'),
                writable: true,
                configurable: true,
            })

            await router.handleRouteChange()
            expect(window.location.hash).toBe('#home')

            // 恢復原始 hash
            Object.defineProperty(window, 'location', {
                value: new URL(`http://localhost${originalHash}`),
                writable: true,
                configurable: true,
            })
        })

        it('當頁面沒有 render 方法時應記錄錯誤', async () => {
            const consoleSpy = vi
                .spyOn(console, 'error')
                .mockImplementation(() => {})
            router.register('broken', {}) // 無 render 方法
            Object.defineProperty(window, 'location', {
                value: new URL('http://localhost/#broken'),
                writable: true,
                configurable: true,
            })

            await router.handleRouteChange()
            expect(consoleSpy).toHaveBeenCalledWith(
                'Page broken does not implement render method'
            )
            consoleSpy.mockRestore()
        })

        it('重複 hash 不應重新渲染', async () => {
            const mockPage = { render: vi.fn() }
            router.register('home', mockPage)
            Object.defineProperty(window, 'location', {
                value: new URL('http://localhost/#home'),
                writable: true,
                configurable: true,
            })

            await router.handleRouteChange()
            expect(mockPage.render).toHaveBeenCalledTimes(1)

            // 再次呼叫相同 hash
            await router.handleRouteChange()
            expect(mockPage.render).toHaveBeenCalledTimes(1)
        })

        it('應處理無 query string 的 URL', async () => {
            const capturedParams = {}
            const mockPage = {
                render: vi.fn(params => {
                    capturedParams.params = params
                }),
            }
            router.register('home', mockPage)
            Object.defineProperty(window, 'location', {
                value: new URL('http://localhost/#home'),
                writable: true,
                configurable: true,
            })

            await router.handleRouteChange()
            expect(capturedParams.params).toBeDefined()
        })
    })

    describe('updateActiveNavItem', () => {
        it('應為匹配的 nav item 添加 active class', async () => {
            setupNavItems(['home', 'settings'])
            const testRouter = new Router(mockApp)
            testRouter.updateActiveNavItem('home')
            expect(
                document
                    .querySelector('[data-page="home"]')
                    .classList.contains('active')
            ).toBe(true)

            // 再次呼叫切換到 settings
            testRouter.updateActiveNavItem('settings')
            expect(
                document
                    .querySelector('[data-page="home"]')
                    .classList.contains('active')
            ).toBe(false)
            expect(
                document
                    .querySelector('[data-page="settings"]')
                    .classList.contains('active')
            ).toBe(true)
        })

        it('無 nav items 時不報錯', () => {
            clearNavItems()
            const testRouter = new Router(mockApp)
            expect(() => testRouter.updateActiveNavItem('home')).not.toThrow()
        })
    })
})
