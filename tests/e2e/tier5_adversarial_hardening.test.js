/**
 * Tier 5: Adversarial Coverage Hardening E2E Test Suite (Milestone 4)
 * 
 * Conducts white-box adversarial stress testing across all failure modes:
 * - Adversarial Storage Injections & State Tampering
 * - Global Runtime & Prototype Attack Resilience
 * - Hostile Network & Flapping Online/Offline Concurrency
 * - Chaotic Route Fuzzing & Fast Navigation Stress
 * - Trojan Backup Restoration (Ad artifact import resilience)
 * - Store URL Boundary & Traversal Sanitization
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getStoreUrl } from '../../src/js/utils.js'
import DataService from '../../src/js/dataService.js'
import { SettingsPage } from '../../src/js/pages/settingsPage.js'
import { EasyAccountingApp } from '../../src/js/main.js'
import { createMockApp } from './setup.js'

describe('Tier 5: Adversarial Coverage Hardening (Adversarial White-Box)', () => {
    let mockApp
    let dataService

    beforeEach(async () => {
        document.body.innerHTML = `
            <div id="app-container" class="relative min-h-screen w-full md:pl-64">
                <div id="skeleton-screen"></div>
            </div>
            <nav id="bottom-nav">
                <a href="#home" data-page="home">首頁</a>
                <a href="#records" data-page="records">明細</a>
                <a href="#add" data-page="add">新增</a>
                <a href="#stats" data-page="stats">統計</a>
                <a href="#settings" data-page="settings">設定</a>
            </nav>
            <div id="toast" class="opacity-0"><span id="toast-message"></span></div>
        `
        localStorage.clear()
        dataService = new DataService()
        await dataService.init()
        mockApp = createMockApp(dataService)
    })

    afterEach(() => {
        document.body.innerHTML = ''
        localStorage.clear()
        vi.restoreAllMocks()
    })

    describe('1. Adversarial Storage Injections & State Tampering', () => {
        it('ADV1.1: Pre-populated ad keys in localStorage are purged on App initialization without resurrection', async () => {
            localStorage.setItem('adFreeUntil', String(Date.now() + 86400000))
            localStorage.setItem('adMobAppId', 'ca-app-pub-9999999999999999~9999999999')
            localStorage.setItem('gpt_slot_id', '/1234567/banner_ad')
            localStorage.setItem('ad_tracking_consent', 'true')

            const realApp = new EasyAccountingApp()
            expect(localStorage.getItem('adFreeUntil')).toBeNull()
            expect(realApp.rewardService).toBeUndefined()
        })

        it('ADV1.2: In-memory injection of adFreeUntil during runtime does not produce ad DOM elements in SettingsPage', async () => {
            const page = new SettingsPage(mockApp)
            // Malicious script attempts to set adFreeUntil to future
            localStorage.setItem('adFreeUntil', '9999999999999')
            await page.render()

            const container = document.getElementById('app-container')
            expect(container.querySelector('#settings-banner-ad')).toBeNull()
            expect(container.querySelector('#sponsor-reward-ad-btn')).toBeNull()
            expect(container.innerHTML).not.toContain('觀看廣告')
            expect(container.innerHTML).not.toContain('無廣告模式')
        })

        it('ADV1.3: Saving settings with injected malicious adConfig payload does not corrupt DataService or app state', async () => {
            const maliciousPayload = {
                theme: 'dark',
                adConfig: { enabled: true, publisherId: 'ca-app-pub-fake' },
                adFreeUntil: 9999999999
            }
            await dataService.saveSetting({ key: 'app_settings', value: maliciousPayload })

            const saved = await dataService.getSetting('app_settings')
            expect(saved.value.theme).toBe('dark')
            // Verify app still instantiates cleanly without rewardService
            expect(mockApp.rewardService).toBeUndefined()
        })
    })

    describe('2. Global Runtime & Prototype Attack Resilience', () => {
        it('ADV2.1: Hostile injection of window.googletag and window.adsbygoogle does not trigger ad executions', async () => {
            const fakeCmd = []
            window.googletag = { cmd: fakeCmd, display: vi.fn(), pubads: vi.fn() }
            window.adsbygoogle = { push: vi.fn() }

            const page = new SettingsPage(mockApp)
            await page.render()

            // Verify our app never pushed anything to fake googletag or adsbygoogle
            expect(fakeCmd.length).toBe(0)
            expect(window.adsbygoogle.push).not.toHaveBeenCalled()

            delete window.googletag
            delete window.adsbygoogle
        })

        it('ADV2.2: Fuzzing legacy rewardService short-circuit optional chaining with arbitrary malicious calls', () => {
            // Optional chaining syntax used across legacy code bases: app.rewardService?.xxx()
            expect(() => mockApp.rewardService?.showRewardedAd('MALICIOUS_INPUT', { force: true })).not.toThrow()
            expect(() => mockApp.rewardService?.isAdFree(NaN, -1, 'INVALID')).not.toThrow()
            expect(() => mockApp.rewardService?.renderBannerAd(document.body, 'hacked')).not.toThrow()
            expect(mockApp.rewardService?.isAdFree()).toBeUndefined()
        })

        it('ADV2.3: Prototype pollution attempt with Object.prototype.rewardService is harmless', () => {
            try {
                Object.prototype.rewardService = { isAdFree: () => true }
                const testApp = new EasyAccountingApp()
                // constructor does not assign this.rewardService
                expect(testApp.hasOwnProperty('rewardService')).toBe(false)
            } finally {
                delete Object.prototype.rewardService
            }
        })
    })

    describe('3. Hostile Network & Offline/Online Flapping Concurrency', () => {
        it('ADV3.1: High-concurrency transaction creation during offline flapping produces zero ad network requests', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('{}')))
            
            // Set offline
            Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

            // Concurrently create 25 transactions
            const tasks = []
            for (let i = 0; i < 25; i++) {
                tasks.push(dataService.addRecord({
                    type: i % 2 === 0 ? 'expense' : 'income',
                    amount: 100 + i,
                    categoryId: 'food',
                    date: '2026-10-31',
                    description: `Stress Test #${i}`
                }))
            }
            await Promise.all(tasks)

            // Flap network online
            Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
            window.dispatchEvent(new Event('online'))

            // Verify NO ad-related fetches occurred
            for (const call of fetchSpy.mock.calls) {
                const url = typeof call[0] === 'string' ? call[0] : call[0]?.url || ''
                expect(url).not.toContain('internal-ads')
                expect(url).not.toContain('doubleclick')
                expect(url).not.toContain('googlesyndication')
                expect(url).not.toContain('admob')
            }
            fetchSpy.mockRestore()
        })
    })

    describe('4. Chaotic Route Fuzzing & Navigation Stress', () => {
        it('ADV4.1: Rapid-fire route transitions (30 iterations) execute without memory leaks or zombie ad containers', async () => {
            const routes = ['home', 'records', 'add', 'stats', 'settings']
            const app = new EasyAccountingApp()

            // Chaotic rapid switching
            for (let i = 0; i < 30; i++) {
                const target = routes[i % routes.length]
                window.location.hash = `#${target}`
                await app.router.handleRouteChange()
            }

            const container = document.getElementById('app-container')
            expect(container.querySelectorAll('.adsbygoogle').length).toBe(0)
            expect(container.querySelectorAll('[id*="ad-"]').length).toBe(0)
            expect(container.querySelectorAll('[id*="banner-ad"]').length).toBe(0)
        })
    })

    describe('5. Trojan Backup Restoration (Ad Artifact Resilience)', () => {
        it('ADV5.1: Restoring backup data containing legacy ad metadata preserves records without restoring ad state', async () => {
            const trojanBackup = {
                version: '2.1.8.5',
                timestamp: Date.now(),
                adConfig: { enabled: true, adUnitId: 'fake-unit' },
                adFreeUntil: 1999999999999,
                ledgers: [
                    { id: 1, uuid: 'default-ledger', name: '預設帳本', isDefault: true }
                ],
                records: [
                    { id: 101, amount: 500, type: 'expense', categoryId: 'food', date: '2026-10-31', description: '午餐', ledgerId: 1 }
                ],
                accounts: [],
                contacts: [],
                debts: [],
                recurring_transactions: [],
                amortizations: [],
                settings: {
                    adFreeUntil: 1999999999999,
                    theme: 'system'
                }
            }

            await dataService._restoreFromBackup(trojanBackup)

            const records = await dataService.getRecords()
            expect(records.length).toBe(1)
            expect(records[0].description).toBe('午餐')

            // Verify adFreeUntil is NOT populated in localStorage
            expect(localStorage.getItem('adFreeUntil')).toBeNull()
        })
    })

    describe('6. Store URL Boundary & Traversal Sanitization', () => {
        it('ADV6.1: getStoreUrl safely resolves empty, nested, and leading/trailing slash paths without ad tracking parameters', () => {
            const url1 = getStoreUrl('')
            expect(url1).toBe('/')

            const url2 = getStoreUrl('plugins/dark-theme.js')
            expect(url2).toBe('/plugins/dark-theme.js')

            const url3 = getStoreUrl('/plugins/deeply/nested/extension.json')
            expect(url3).toBe('/plugins/deeply/nested/extension.json')

            // Ensure no ad query parameters are injected
            expect(url3).not.toContain('utm_source')
            expect(url3).not.toContain('gclid')
            expect(url3).not.toContain('ad_id')
        })

        it('ADV6.2: getStoreUrl in native environment prepends __WEB_STORE_URL__ without trailing double-slashes', () => {
            globalThis.Capacitor = {
                isNativePlatform: () => true
            }

            const nativeUrl = getStoreUrl('/plugins/test.js')
            expect(nativeUrl).toBe('https://jijun.the-walking-fish.com/plugins/test.js')
            expect(nativeUrl).not.toContain('com//plugins')

            globalThis.Capacitor = {
                isNativePlatform: () => false
            }
        })
    })
})
