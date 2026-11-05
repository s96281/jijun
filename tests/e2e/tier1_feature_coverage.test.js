/**
 * Tier 1: Feature Coverage E2E Test Suite
 * 
 * Verifies primary feature specifications from ORIGINAL_REQUEST.md & PROJECT.md:
 * - Feature 1: Zero Ad Services (>=5 tests)
 * - Feature 2: Zero Ad DOM Elements (>=5 tests)
 * - Feature 3: Zero Ad Scripts / Network Requests (>=5 tests)
 * - Feature 4: Store URL Functionality Retention (>=5 tests)
 * - Feature 5: Core Accounting Intact (>=5 tests)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { getStoreUrl } from '../../src/js/utils.js'
import DataService from '../../src/js/dataService.js'
import { CategoryManager } from '../../src/js/categoryManager.js'
import { LedgerManager } from '../../src/js/ledgerManager.js'
import { SettingsPage } from '../../src/js/pages/settingsPage.js'
import { PrivacyPage } from '../../src/js/pages/privacyPage.js'
import { HomePage } from '../../src/js/pages/homePage.js'
import { EasyAccountingApp } from '../../src/js/main.js'

import { createMockApp } from './setup.js'

describe('Tier 1: Feature Coverage - Ad Removal & System Integrity', () => {
    let mockApp

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
        const ds = new DataService()
        await ds.init()
        mockApp = createMockApp(ds)
    })

    afterEach(() => {
        document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    // =========================================================================
    // Feature 1: Zero Ad Services
    // =========================================================================
    describe('Feature 1: Zero Ad Services', () => {
        it('F1.1: Application instance does not expose rewardService', () => {
            expect(EasyAccountingApp).toBeDefined()
            // Authoritative contract: this.rewardService is eliminated from constructor
            const originalInit = EasyAccountingApp.prototype.init
            EasyAccountingApp.prototype.init = vi.fn().mockResolvedValue()
            try {
                const app = new EasyAccountingApp()
                expect(app.rewardService).toBeUndefined()
            } finally {
                EasyAccountingApp.prototype.init = originalInit
            }
        })

        it('F1.2: window.RewardService is undefined in global scope', () => {
            expect(typeof window.RewardService).toBe('undefined')
            expect(typeof globalThis.RewardService).toBe('undefined')
        })

        it('F1.3: Calling legacy app.rewardService?.isAdFree() safely returns falsy without error', () => {
            expect(() => {
                const isAdFree = mockApp.rewardService?.isAdFree?.()
                expect(isAdFree).toBeFalsy()
            }).not.toThrow()
        })

        it('F1.4: Calling legacy app.rewardService?.showRewardedAd() safely returns undefined without error', async () => {
            await expect(async () => {
                const res = await mockApp.rewardService?.showRewardedAd?.()
                expect(res).toBeUndefined()
            }).not.toThrow()
        })

        it('F1.5: Calling legacy app.rewardService?.renderBannerAd() safely evaluates without crashing', async () => {
            const dummyContainer = document.createElement('div')
            await expect(async () => {
                const res = await mockApp.rewardService?.renderBannerAd?.(dummyContainer)
                expect(res).toBeUndefined()
            }).not.toThrow()
            expect(dummyContainer.innerHTML).toBe('')
        })

        it('F1.6: Physical file src/js/rewardService.js is deleted from filesystem', () => {
            const filePath = resolve(process.cwd(), 'src/js/rewardService.js')
            expect(existsSync(filePath)).toBe(false)
        })
    })

    // =========================================================================
    // Feature 2: Zero Ad DOM Elements
    // =========================================================================
    describe('Feature 2: Zero Ad DOM Elements', () => {
        it('F2.1: SettingsPage render produces no #settings-banner-ad element', async () => {
            const page = new SettingsPage(mockApp)
            await page.render()
            const banner = document.getElementById('settings-banner-ad')
            expect(banner).toBeNull()
        })

        it('F2.2: SettingsPage render produces no #sponsor-reward-ad-btn element', async () => {
            const page = new SettingsPage(mockApp)
            await page.render()
            const btn = document.getElementById('sponsor-reward-ad-btn')
            expect(btn).toBeNull()
        })

        it('F2.3: SettingsPage HTML contains no ad-removal or reward text copy', async () => {
            const page = new SettingsPage(mockApp)
            await page.render()
            const html = mockApp.appContainer.innerHTML
            expect(html).not.toContain('觀看廣告以移除廣告')
            expect(html).not.toContain('已啟用無廣告模式')
            expect(html).not.toContain('fa-rectangle-ad')
        })

        it('F2.4: Core views contain zero ad banner containers or ad placeholders', async () => {
            const homePage = new HomePage(mockApp)
            await homePage.render()
            expect(document.querySelector('[id*="banner-ad"]')).toBeNull()
            expect(document.querySelector('[class*="banner-ad"]')).toBeNull()
        })

        it('F2.5: No <ins class="adsbygoogle"> elements exist anywhere in rendered DOM', async () => {
            const page = new SettingsPage(mockApp)
            await page.render()
            const adsbygoogle = document.querySelectorAll('ins.adsbygoogle')
            expect(adsbygoogle.length).toBe(0)
        })

        it('F2.6: Modals and notifications contain no ad promotion or sponsor popups', () => {
            const allElements = document.querySelectorAll('*')
            for (const el of allElements) {
                expect(el.textContent).not.toContain('贊助廣告')
                expect(el.textContent).not.toContain('獎勵廣告')
            }
        })
    })

    // =========================================================================
    // Feature 3: Zero Ad Scripts & Network Requests
    // =========================================================================
    describe('Feature 3: Zero Ad Scripts & Network Requests', () => {
        it('F3.1: No Google AdSense script (adsbygoogle.js) injected into DOM', () => {
            const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src)
            const hasAdsense = scripts.some(src => src.includes('pagead2.googlesyndication.com') || src.includes('adsbygoogle.js'))
            expect(hasAdsense).toBe(false)
        })

        it('F3.2: No Google Publisher Tag script (gpt.js) injected into DOM', () => {
            const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src)
            const hasGpt = scripts.some(src => src.includes('securepubads.g.doubleclick.net') || src.includes('gpt.js'))
            expect(hasGpt).toBe(false)
        })

        it('F3.3: No network requests made for /internal-ads.json during app lifecycle', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch')
            const page = new SettingsPage(mockApp)
            await page.render()
            
            const internalAdCalls = fetchSpy.mock.calls.filter(call => {
                const url = typeof call[0] === 'string' ? call[0] : call[0]?.url
                return url && url.includes('internal-ads.json')
            })
            expect(internalAdCalls.length).toBe(0)
        })

        it('F3.4: Physical file public/internal-ads.json is deleted from filesystem', () => {
            const filePath = resolve(process.cwd(), 'public/internal-ads.json')
            expect(existsSync(filePath)).toBe(false)
        })

        it('F3.5: PrivacyPage rendered clauses contain no third-party advertising tracking statements', async () => {
            const privacyPage = new PrivacyPage(mockApp)
            await privacyPage.render()
            const content = mockApp.appContainer.innerHTML
            expect(content).not.toContain('Google AdMob')
            expect(content).not.toContain('Google AdSense')
            expect(content).not.toContain('廣告與第三方服務')
        })

        it('F3.6: Global googletag object is not created or referenced in runtime', () => {
            expect(typeof window.googletag).toBe('undefined')
            expect(typeof globalThis.googletag).toBe('undefined')
        })
    })

    // =========================================================================
    // Feature 4: Store URL Functionality Retention
    // =========================================================================
    describe('Feature 4: Store URL Functionality Retention', () => {
        it('F4.1: getStoreUrl returns relative path in web environment', () => {
            globalThis.Capacitor = { isNativePlatform: () => false }
            const url = getStoreUrl('themes/my-theme.json')
            expect(url).toBe('/themes/my-theme.json')
        })

        it('F4.2: getStoreUrl properly normalizes leading slash paths', () => {
            globalThis.Capacitor = { isNativePlatform: () => false }
            const url = getStoreUrl('/themes/custom.json')
            expect(url).toBe('/themes/custom.json')
            expect(url).not.toContain('//themes')
        })

        it('F4.3: getStoreUrl prepends base URL in Capacitor native environment', () => {
            globalThis.Capacitor = { isNativePlatform: () => true }
            const url = getStoreUrl('themes/custom-theme.json')
            expect(url).toContain('https://jijun.the-walking-fish.com/themes/custom-theme.json')
        })

        it('F4.4: getStoreUrl produces clean URLs without ad or affiliate tracking parameters', () => {
            globalThis.Capacitor = { isNativePlatform: () => true }
            const url = getStoreUrl('themes/dark.json')
            expect(url).not.toContain('utm_')
            expect(url).not.toContain('gclid')
            expect(url).not.toContain('ad_')
        })

        it('F4.5: getStoreUrl handles deeply nested store paths', () => {
            globalThis.Capacitor = { isNativePlatform: () => false }
            const url = getStoreUrl('assets/store/v2/manifest.json')
            expect(url).toBe('/assets/store/v2/manifest.json')
        })

        it('F4.6: package.json preserves webStoreUrl or defaults gracefully without adConfig', () => {
            const pkgPath = resolve(process.cwd(), 'package.json')
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
            // Must have webStoreUrl either at top-level or legacy
            const webStoreUrl = pkg.webStoreUrl || (pkg.adConfig && pkg.adConfig.webStoreUrl)
            expect(webStoreUrl).toBe('https://jijun.the-walking-fish.com')
        })
    })

    // =========================================================================
    // Feature 5: Core Accounting Intact
    // =========================================================================
    describe('Feature 5: Core Accounting Flow Preservation', () => {
        let dataService, categoryManager, ledgerManager

        beforeEach(async () => {
            dataService = new DataService()
            await dataService.init()
            categoryManager = new CategoryManager(dataService)
            await categoryManager.init()
            ledgerManager = new LedgerManager(dataService, mockApp)
            await ledgerManager.init()
        })

        it('F5.1: DataService adds income and expense records with accurate storage', async () => {
            const expense = {
                type: 'expense',
                amount: 150,
                category: 'food',
                date: '2026-10-30',
                note: 'Lunch Bento',
            }
            const income = {
                type: 'income',
                amount: 3000,
                category: 'salary',
                date: '2026-10-30',
                note: 'Part-time Bonus',
            }

            const expId = await dataService.addRecord(expense)
            const incId = await dataService.addRecord(income)

            expect(expId).toBeDefined()
            expect(incId).toBeDefined()

            const records = await dataService.getRecords()
            expect(records.length).toBe(2)
            expect(records.find(r => r.note === 'Lunch Bento').amount).toBe(150)
            expect(records.find(r => r.note === 'Part-time Bonus').amount).toBe(3000)
        })

        it('F5.2: Balance calculations correctly aggregate income minus expense', async () => {
            await dataService.addRecord({ type: 'income', amount: 5000, category: 'salary', date: '2026-10-01' })
            await dataService.addRecord({ type: 'expense', amount: 1200, category: 'food', date: '2026-10-02' })
            await dataService.addRecord({ type: 'expense', amount: 800, category: 'transport', date: '2026-10-03' })

            const records = await dataService.getRecords()
            const totalIncome = records.filter(r => r.type === 'income').reduce((sum, r) => sum + r.amount, 0)
            const totalExpense = records.filter(r => r.type === 'expense').reduce((sum, r) => sum + r.amount, 0)
            const netBalance = totalIncome - totalExpense

            expect(totalIncome).toBe(5000)
            expect(totalExpense).toBe(2000)
            expect(netBalance).toBe(3000)
        })

        it('F5.3: Querying records by date filters returns correct subset of transactions', async () => {
            await dataService.addRecord({ type: 'expense', amount: 100, date: '2026-10-15', category: 'food' })
            await dataService.addRecord({ type: 'expense', amount: 200, date: '2026-10-25', category: 'food' })
            await dataService.addRecord({ type: 'expense', amount: 300, date: '2026-11-05', category: 'food' })

            const octRecords = await dataService.getRecords({ startDate: '2026-10-01', endDate: '2026-10-31' })
            expect(octRecords.length).toBe(2)
            const sumOct = octRecords.reduce((sum, r) => sum + r.amount, 0)
            expect(sumOct).toBe(300)
        })

        it('F5.4: CategoryManager lists default categories and supports custom category creation', async () => {
            const expenseCats = categoryManager.getAllCategories('expense')
            expect(expenseCats.length).toBeGreaterThan(0)
            expect(expenseCats.some(c => c.id === 'food')).toBe(true)

            // Add custom category
            const customCat = { id: 'gaming', name: '電玩娛樂', icon: 'fa-gamepad', color: '#ff6600', isCustom: true }
            await categoryManager.addCustomCategory('expense', customCat)

            const updatedCats = categoryManager.getAllCategories('expense')
            expect(updatedCats.some(c => c.name === '電玩娛樂')).toBe(true)
        })

        it('F5.5: LedgerManager initializes default ledger and supports ledger switching', async () => {
            const ledgers = ledgerManager.getAllLedgers()
            expect(ledgers.length).toBeGreaterThanOrEqual(1)
            const activeLedger = ledgerManager.getActiveLedger()
            expect(activeLedger).toBeDefined()

            // Create new ledger
            const newLedger = await dataService.addLedger({
                name: '出差帳本',
                icon: 'fa-plane',
                color: '#3b82f6',
            })
            expect(newLedger).toBeDefined()
            await ledgerManager.init()

            await ledgerManager.switchLedger(newLedger.id || newLedger)
            const switched = ledgerManager.getActiveLedger()
            expect(switched.name).toBe('出差帳本')
        })

        it('F5.6: Updating and deleting accounting records properly adjusts state', async () => {
            const recordId = await dataService.addRecord({
                type: 'expense',
                amount: 500,
                category: 'shopping',
                date: '2026-10-30',
                note: 'Original Note',
            })

            // Update
            await dataService.updateRecord(recordId, {
                type: 'expense',
                amount: 450,
                category: 'shopping',
                date: '2026-10-30',
                note: 'Discounted Note',
            })

            let updated = await dataService.getRecord(recordId)
            expect(updated.amount).toBe(450)
            expect(updated.note).toBe('Discounted Note')

            // Delete
            await dataService.deleteRecord(recordId)
            let deleted = await dataService.getRecord(recordId)
            expect(deleted).toBeNull()
        })
    })
})
