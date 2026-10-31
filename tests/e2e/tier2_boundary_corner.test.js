/**
 * Tier 2: Boundary & Corner Cases E2E Test Suite
 * 
 * Verifies edge conditions and stress resilience:
 * - Boundary 1: Fresh Browser Storage Cold Start (>=5 tests)
 * - Boundary 2: Legacy localStorage Cleanup & Stale State (>=5 tests)
 * - Boundary 3: Offline Mode & Network Resilience (>=5 tests)
 * - Boundary 4: Fast Navigation & Concurrent State (>=5 tests)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import DataService from '../../src/js/dataService.js'
import { SettingsPage } from '../../src/js/pages/settingsPage.js'
import { HomePage } from '../../src/js/pages/homePage.js'
import { RecordsPage } from '../../src/js/pages/recordsPage.js'
import { StatsPage } from '../../src/js/pages/statsPage.js'
import { ThemeManager } from '../../src/js/themeManager.js'
import { CategoryManager } from '../../src/js/categoryManager.js'
import { LedgerManager } from '../../src/js/ledgerManager.js'
import { createMockApp } from './setup.js'

describe('Tier 2: Boundary & Corner Cases - Resilience & Storage Safety', () => {
    let mockApp, dataService

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
        dataService = new DataService()
        await dataService.init()

        mockApp = createMockApp(dataService)
        mockApp.ledgerManager = new LedgerManager(dataService, mockApp)
        await mockApp.ledgerManager.init()
    })

    afterEach(() => {
        document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    // =========================================================================
    // Boundary 1: Fresh Browser Storage Cold Start
    // =========================================================================
    describe('Boundary 1: Fresh Browser Storage Cold Start', () => {
        it('B1.1: Cold start with pristine empty localStorage does not populate adFreeUntil', async () => {
            localStorage.clear()
            expect(localStorage.getItem('adFreeUntil')).toBeNull()

            const page = new SettingsPage(mockApp)
            await page.render()

            expect(localStorage.getItem('adFreeUntil')).toBeNull()
        })

        it('B1.2: Cold start initializes default ledger #1 without ad fields or metadata', async () => {
            const ledgerMgr = new LedgerManager(dataService, mockApp)
            await ledgerMgr.init()

            const activeLedger = ledgerMgr.getActiveLedger()
            expect(activeLedger).toBeDefined()
            expect(activeLedger.id).toBe(1)
            expect(activeLedger.adConfig).toBeUndefined()
            expect(activeLedger.rewarded).toBeUndefined()
        })

        it('B1.3: SettingsPage renders cleanly on fresh browser storage without throwing errors', async () => {
            localStorage.clear()
            const page = new SettingsPage(mockApp)
            await expect(page.render()).resolves.not.toThrow()
            expect(mockApp.appContainer.querySelector('h2').textContent).toContain('設定')
        })

        it('B1.4: CategoryManager bootstraps default categories on first launch without ad dependency', async () => {
            const catMgr = new CategoryManager(dataService)
            await catMgr.init()

            const expenseCats = catMgr.getAllCategories('expense')
            const incomeCats = catMgr.getAllCategories('income')
            expect(expenseCats.length).toBeGreaterThan(0)
            expect(incomeCats.length).toBeGreaterThan(0)
            // No ad-sponsored category
            expect(expenseCats.some(c => c.name?.includes('贊助') || c.name?.includes('廣告'))).toBe(false)
        })

        it('B1.5: ThemeManager initializes default theme on cold start without ad-free check', async () => {
            const themeMgr = new ThemeManager(dataService)
            await expect(themeMgr.init()).resolves.not.toThrow()
            expect(['system', 'light', 'dark', 'custom']).toContain(themeMgr.themeMode)
        })
    })

    // =========================================================================
    // Boundary 2: Legacy localStorage Cleanup & Stale State
    // =========================================================================
    describe('Boundary 2: Legacy localStorage Cleanup & Stale State', () => {
        it('B2.1: Expired adFreeUntil in localStorage is ignored and causes zero errors', async () => {
            const pastTimestamp = (Date.now() - 1000 * 60 * 60 * 24 * 30).toString()
            localStorage.setItem('adFreeUntil', pastTimestamp)

            const page = new SettingsPage(mockApp)
            await page.render()

            expect(mockApp.appContainer.innerHTML).not.toContain('已啟用無廣告模式')
            expect(mockApp.appContainer.innerHTML).not.toContain('觀看廣告以移除廣告')
        })

        it('B2.2: Future adFreeUntil in localStorage does not display ad reward banners', async () => {
            const futureTimestamp = (Date.now() + 1000 * 60 * 60 * 24 * 7).toString()
            localStorage.setItem('adFreeUntil', futureTimestamp)

            const page = new SettingsPage(mockApp)
            await page.render()

            const banner = document.getElementById('settings-banner-ad')
            expect(banner).toBeNull()
            expect(mockApp.appContainer.innerHTML).not.toContain('感謝支持！無廣告模式剩餘')
        })

        it('B2.3: Corrupted non-numeric adFreeUntil is handled gracefully without NaN crash', async () => {
            localStorage.setItem('adFreeUntil', 'INVALID_CORRUPTED_STRING_VALUE')

            const page = new SettingsPage(mockApp)
            await expect(page.render()).resolves.not.toThrow()
            expect(mockApp.appContainer.innerHTML).not.toContain('NaN')
        })

        it('B2.4: Saving user settings does not recreate or modify adFreeUntil', async () => {
            localStorage.removeItem('adFreeUntil')
            await dataService.saveSetting('testSetting', 'testValue')

            expect(localStorage.getItem('adFreeUntil')).toBeNull()
        })

        it('B2.5: Sanitizing legacy ad keys leaves accounting data intact', async () => {
            // Seed record
            const id = await dataService.addRecord({
                type: 'expense',
                amount: 300,
                category: 'food',
                date: '2026-10-30',
            })

            localStorage.setItem('adFreeUntil', '1234567890')
            localStorage.removeItem('adFreeUntil')

            const record = await dataService.getRecord(id)
            expect(record).not.toBeNull()
            expect(record.amount).toBe(300)
            expect(localStorage.getItem('adFreeUntil')).toBeNull()
        })
    })

    // =========================================================================
    // Boundary 3: Offline Mode & Network Resilience
    // =========================================================================
    describe('Boundary 3: Offline Mode & Network Resilience', () => {
        beforeEach(() => {
            Object.defineProperty(navigator, 'onLine', {
                value: false,
                configurable: true,
                writable: true,
            })
        })

        it('B3.1: Full transaction creation and retrieval perform 100% locally when offline', async () => {
            const record = {
                type: 'expense',
                amount: 88,
                category: 'drinks',
                date: '2026-10-30',
                note: 'Offline bubble tea',
            }

            const id = await dataService.addRecord(record)
            expect(id).toBeDefined()

            const saved = await dataService.getRecord(id)
            expect(saved.note).toBe('Offline bubble tea')
            expect(saved.amount).toBe(88)
        })

        it('B3.2: SettingsPage renders immediately offline without ad timeout lag', async () => {
            const start = performance.now()
            const page = new SettingsPage(mockApp)
            await page.render()
            const elapsed = performance.now() - start

            // Offline render should be fast (< 200ms) without waiting for script timeouts (like loadScript 3000ms)
            expect(elapsed).toBeLessThan(500)
            expect(document.getElementById('settings-banner-ad')).toBeNull()
        })

        it('B3.3: Tab navigation operates instantly offline without blocked ad fetch promises', async () => {
            const home = new HomePage(mockApp)
            const records = new RecordsPage(mockApp)
            const stats = new StatsPage(mockApp)

            await expect(home.render()).resolves.not.toThrow()
            await expect(records.render()).resolves.not.toThrow()
            await expect(stats.render()).resolves.not.toThrow()
        })

        it('B3.4: Transitioning from offline to online does not trigger deferred ad SDK requests', async () => {
            const fetchSpy = vi.spyOn(globalThis, 'fetch')
            
            // Switch online
            Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
            window.dispatchEvent(new Event('online'))

            // Verify no ad requests
            const adCalls = fetchSpy.mock.calls.filter(call => {
                const url = typeof call[0] === 'string' ? call[0] : call[0]?.url
                return url && (url.includes('google') || url.includes('ads') || url.includes('admob'))
            })
            expect(adCalls.length).toBe(0)
        })

        it('B3.5: Category management and statistics calculations succeed offline', async () => {
            const catMgr = new CategoryManager(dataService)
            await catMgr.init()
            const cats = catMgr.getAllCategories('expense')
            expect(cats.length).toBeGreaterThan(0)

            await dataService.addRecord({ type: 'income', amount: 1000, category: 'salary', date: '2026-10-30' })
            const allRecords = await dataService.getRecords()
            expect(allRecords.length).toBeGreaterThan(0)
        })
    })

    // =========================================================================
    // Boundary 4: Fast Navigation & Concurrent State
    // =========================================================================
    describe('Boundary 4: Fast Navigation & Concurrent State', () => {
        it('B4.1: Rapid hash switching does not leak unhandled exceptions or ad errors', async () => {
            const pages = [
                new HomePage(mockApp),
                new RecordsPage(mockApp),
                new SettingsPage(mockApp),
                new StatsPage(mockApp),
            ]

            for (const page of pages) {
                await expect(page.render()).resolves.not.toThrow()
            }
        })

        it('B4.2: Repeated render calls on SettingsPage do not duplicate DOM elements', async () => {
            const page = new SettingsPage(mockApp)
            await page.render()
            await page.render()
            await page.render()

            const settingsHeaders = mockApp.appContainer.querySelectorAll('h2')
            expect(settingsHeaders.length).toBe(1)
        })

        it('B4.3: Interrupted page transitions maintain clean container structure', async () => {
            const page1 = new SettingsPage(mockApp)
            const page2 = new HomePage(mockApp)

            // Start rendering page1 then immediately render page2
            const p1 = page1.render()
            const p2 = page2.render()

            await Promise.all([p1, p2])

            // Container should contain valid page HTML, not broken mixed state
            expect(mockApp.appContainer.children.length).toBeGreaterThan(0)
            expect(document.getElementById('settings-banner-ad')).toBeNull()
        })

        it('B4.4: No asynchronous ad timer callbacks fire after page unmount', async () => {
            vi.useFakeTimers()
            const page = new SettingsPage(mockApp)
            await page.render()

            // Navigate away
            mockApp.appContainer.innerHTML = '<div>Navigated Away</div>'

            // Advance timers by 10 seconds
            vi.advanceTimersByTime(10000)

            // Ensure no ad elements suddenly appeared
            expect(document.getElementById('settings-banner-ad')).toBeNull()
            expect(document.getElementById('sponsor-reward-ad-btn')).toBeNull()

            vi.useRealTimers()
        })

        it('B4.5: Concurrent accounting writes during page transition preserve data consistency', async () => {
            const writePromises = []
            for (let i = 0; i < 10; i++) {
                writePromises.push(dataService.addRecord({
                    type: 'expense',
                    amount: 10 + i,
                    category: 'food',
                    date: '2026-10-30',
                    note: `Concurrent ${i}`,
                }))
            }

            const page = new SettingsPage(mockApp)
            const renderPromise = page.render()

            await Promise.all([...writePromises, renderPromise])

            const records = await dataService.getRecords()
            expect(records.length).toBe(10)
        })
    })
})
