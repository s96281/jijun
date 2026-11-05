import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EasyAccountingApp } from '../../src/js/main.js'
import { SettingsPage } from '../../src/js/pages/settingsPage.js'
import DataService from '../../src/js/dataService.js'
import { THEME_MODES } from '../../src/js/themeManager.js'

describe('Empirical Challenger M1-2: Storage Behavior & SettingsPage Stress Suite', () => {
    let mockApp
    let ds

    beforeEach(async () => {
        // Prevent background PWA init lifecycle from running during constructor tests
        vi.spyOn(EasyAccountingApp.prototype, 'init').mockImplementation(() => Promise.resolve())

        // Mock matchMedia for jsdom
        if (!globalThis.window.matchMedia) {
            globalThis.window.matchMedia = vi.fn().mockImplementation(query => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }))
        }

        // Reset DOM
        document.body.innerHTML = `
            <div id="app-container"></div>
            <div id="sidebar-ledger-switcher"></div>
            <div id="sidebar-version-info"></div>
            <div id="install-pwa-btn-container" class="hidden"></div>
            <div id="offline-banner" class="hidden"></div>
            <div id="toast" class="opacity-0"><span id="toast-message"></span></div>
        `

        // Reset localStorage
        localStorage.clear()

        // Setup DataService connected to mockDb
        ds = new DataService()
        ds.db = await globalThis.idb.openDB()
        ds.activeLedgerId = 1

        // Seed default ledger
        const ledgers = ds.db._storeData['ledgers'] || []
        ledgers.length = 0
        ledgers.push({
            id: 1,
            uuid: 'ledger-uuid-1',
            name: '預設帳本',
            icon: 'fa-solid fa-book',
            color: '#334A52',
            type: 'personal',
            createdAt: Date.now(),
        })

        // Complete Mock App environment for SettingsPage (reflecting full EasyAccountingApp runtime)
        mockApp = {
            appContainer: document.getElementById('app-container'),
            dataService: ds,
            themeManager: {
                themeMode: THEME_MODES.SYSTEM,
                setThemeMode: vi.fn(async mode => {
                    mockApp.themeManager.themeMode = mode
                }),
                activeTheme: { id: 'builtin.dark', name: '深色模式' },
            },
            changelogManager: {
                getAllVersions: () => [{ version: '2.1.8.5' }],
                showChangelogModal: vi.fn(),
            },
            guideManager: {
                resetAllGuides: vi.fn(),
                showWelcomeModal: vi.fn(),
                showToggleTour: vi.fn(),
            },
            budgetManager: {
                renderBudgetWidget: vi.fn().mockResolvedValue(''),
                loadBudget: vi.fn().mockResolvedValue(),
            },
            notificationService: {
                init: vi.fn().mockResolvedValue(),
            },
            aiService: {
                getQuantization: () => 'q4_k_m',
                hasModelUpdate: () => false,
                isModelDownloaded: () => false,
                checkForModelUpdate: () => Promise.resolve({ hasUpdate: false }),
                isExperimentalEnabled: () => false,
                init: vi.fn().mockResolvedValue(),
            },
            updateSidebarLedger: vi.fn(),
            deferredInstallPrompt: null,
            reloadAppData: vi.fn().mockResolvedValue(),
            rewardService: undefined,
        }
    })

    afterEach(() => {
        document.body.innerHTML = ''
        localStorage.clear()
        vi.restoreAllMocks()
    })

    // =========================================================================
    // Challenge Dimension 1: Storage Behavior & adFreeUntil Removal
    // =========================================================================
    describe('Challenge 1: LocalStorage Storage Behavior Verification', () => {
        it('E1.1: Initializing EasyAccountingApp when adFreeUntil is a future timestamp removes it immediately', () => {
            const futureTimestamp = String(Date.now() + 86400000 * 7)
            localStorage.setItem('adFreeUntil', futureTimestamp)
            expect(localStorage.getItem('adFreeUntil')).toBe(futureTimestamp)

            const app = new EasyAccountingApp()

            expect(localStorage.getItem('adFreeUntil')).toBeNull()
            expect(app.rewardService).toBeUndefined()
        })

        it('E1.2: Initializing EasyAccountingApp when adFreeUntil is an expired timestamp removes it', () => {
            const pastTimestamp = String(Date.now() - 3600000)
            localStorage.setItem('adFreeUntil', pastTimestamp)
            expect(localStorage.getItem('adFreeUntil')).toBe(pastTimestamp)

            const app = new EasyAccountingApp()

            expect(localStorage.getItem('adFreeUntil')).toBeNull()
        })

        it('E1.3: Initializing EasyAccountingApp when adFreeUntil is empty string or malformed data removes it', () => {
            const malformedValues = ['', 'null', 'undefined', 'NaN', '{"corrupted": true}']
            for (const val of malformedValues) {
                localStorage.setItem('adFreeUntil', val)
                expect(localStorage.getItem('adFreeUntil')).toBe(val)

                new EasyAccountingApp()

                expect(localStorage.getItem('adFreeUntil')).toBeNull()
            }
        })

        it('E1.4: Initializing EasyAccountingApp with clean localStorage does not create adFreeUntil', () => {
            expect(localStorage.getItem('adFreeUntil')).toBeNull()

            const app = new EasyAccountingApp()

            expect(localStorage.getItem('adFreeUntil')).toBeNull()
            expect(app.rewardService).toBeUndefined()
        })

        it('E1.5: Adversarial storage error - if localStorage.removeItem throws, constructor does not crash', () => {
            const origRemoveItem = Storage.prototype.removeItem
            Storage.prototype.removeItem = vi.fn().mockImplementation(key => {
                if (key === 'adFreeUntil') {
                    throw new DOMException('The operation is insecure.', 'SecurityError')
                }
                return origRemoveItem.call(localStorage, key)
            })

            try {
                expect(() => {
                    const app = new EasyAccountingApp()
                    expect(app).toBeDefined()
                }).not.toThrow()
            } finally {
                Storage.prototype.removeItem = origRemoveItem
            }
        })

        it('E1.6: adFreeUntil is never set by any lifecycle operation in the application', async () => {
            const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
            
            const app = new EasyAccountingApp()
            expect(app.rewardService).toBeUndefined()

            // Verify no calls wrote 'adFreeUntil'
            const adFreeUntilWrites = setItemSpy.mock.calls.filter(
                call => call[0] === 'adFreeUntil'
            )
            expect(adFreeUntilWrites.length).toBe(0)
        })
    })

    // =========================================================================
    // Challenge Dimension 2: SettingsPage Render & DOM Element Completeness
    // =========================================================================
    describe('Challenge 2: SettingsPage Render & Listener Stress Verification', () => {
        it('E2.1: SettingsPage render() executes smoothly without throwing any errors', async () => {
            const page = new SettingsPage(mockApp)
            await expect(page.render()).resolves.not.toThrow()
            expect(mockApp.appContainer.innerHTML.length).toBeGreaterThan(100)
        })

        it('E2.2: SettingsPage rendered DOM has zero ad banner containers and zero reward ad buttons', async () => {
            const page = new SettingsPage(mockApp)
            await page.render()

            // Explicit IDs that were removed
            expect(document.getElementById('settings-banner-ad')).toBeNull()
            expect(document.getElementById('sponsor-reward-ad-btn')).toBeNull()

            // Substring query selectors
            expect(document.querySelector('[id*="banner-ad"]')).toBeNull()
            expect(document.querySelector('[id*="reward-ad"]')).toBeNull()
            expect(document.querySelector('[class*="banner-ad"]')).toBeNull()

            // Textual inspection
            const html = mockApp.appContainer.innerHTML
            expect(html).not.toContain('觀看廣告')
            expect(html).not.toContain('已啟用無廣告模式')
            expect(html).not.toContain('fa-rectangle-ad')
            expect(html).not.toContain('settings-banner-ad')
            expect(html).not.toContain('sponsor-reward-ad-btn')
        })

        it('E2.3: setupSettingsPageListeners attaches all listeners without missing DOM element errors', async () => {
            const page = new SettingsPage(mockApp)
            await page.render()

            // Verify essential interactive elements exist in the rendered DOM
            const requiredElements = [
                'export-data-btn',
                'import-file-input',
                'import-data-btn',
                'check-update-btn',
                'changelog-btn',
                'privacy-btn',
                'license-btn',
                'force-update-btn',
                'manage-themes-btn',
                'manage-ledgers-btn',
                'cloud-sync-btn',
                'manage-recurring-btn',
                'calculator-mode-toggle',
                'default-period-select',
                'reminder-toggle',
            ]

            for (const id of requiredElements) {
                const el = document.getElementById(id)
                expect(el, `Expected #${id} to exist in SettingsPage DOM`).not.toBeNull()
            }
        })

        it('E2.4: Stress test: Rapid successive renders of SettingsPage (10x) do not throw or corrupt DOM', async () => {
            const page = new SettingsPage(mockApp)
            for (let i = 0; i < 10; i++) {
                await expect(page.render()).resolves.not.toThrow()
                expect(document.getElementById('settings-banner-ad')).toBeNull()
                expect(document.getElementById('sponsor-reward-ad-btn')).toBeNull()
            }
        })

        it('E2.5: Interactive navigation listeners trigger proper location hashes', async () => {
            const page = new SettingsPage(mockApp)
            await page.render()

            // Privacy button
            document.getElementById('privacy-btn').click()
            expect(window.location.hash).toBe('#privacy')

            // License button
            document.getElementById('license-btn').click()
            expect(window.location.hash).toBe('#license')

            // Manage ledgers button
            document.getElementById('manage-ledgers-btn').click()
            expect(window.location.hash).toBe('#ledgers')

            // Cloud sync button
            document.getElementById('cloud-sync-btn').click()
            expect(window.location.hash).toBe('#sync-settings')

            // Manage themes button
            document.getElementById('manage-themes-btn').click()
            expect(window.location.hash).toBe('#themes')
        })

        it('E2.6: Theme segmented buttons toggle modes seamlessly without ad side-effects', async () => {
            const page = new SettingsPage(mockApp)
            await page.render()

            const buttons = document.querySelectorAll('#theme-mode-segmented .theme-mode-btn')
            expect(buttons.length).toBe(3) // system, light, dark

            for (const btn of buttons) {
                const targetMode = btn.dataset.mode
                btn.click()
                await new Promise(r => setTimeout(r, 10))
                expect(mockApp.themeManager.setThemeMode).toHaveBeenCalledWith(targetMode)
            }
        })

        it('E2.7: SettingsPage renders under diverse database toggle states', async () => {
            const toggleConfigs = [
                { advanced: false, debt: false, group: false, amort: false },
                { advanced: true, debt: true, group: true, amort: true },
                { advanced: false, debt: true, group: false, amort: true },
            ]

            for (const cfg of toggleConfigs) {
                await ds.saveSetting({ key: 'advancedAccountModeEnabled', value: cfg.advanced })
                await ds.saveSetting({ key: 'debtManagementEnabled', value: cfg.debt })
                await ds.saveSetting({ key: 'groupManagementEnabled', value: cfg.group })
                await ds.saveSetting({ key: 'amortizationEnabled', value: cfg.amort })

                const page = new SettingsPage(mockApp)
                await expect(page.render()).resolves.not.toThrow()

                // Confirm absence of ad elements in each state
                expect(document.getElementById('settings-banner-ad')).toBeNull()
                expect(document.getElementById('sponsor-reward-ad-btn')).toBeNull()
            }
        })

        it('E2.8: Android native platform does not render removed carrier or plugin buttons', async () => {
            globalThis.window.Capacitor = {
                isNativePlatform: () => true,
                getPlatform: () => 'android',
            }

            const page = new SettingsPage(mockApp)
            await page.render()

            expect(document.getElementById('set-invoice-carrier-btn')).toBeNull()
            expect(document.getElementById('manage-plugins-btn')).toBeNull()

            // Reset Capacitor mock
            globalThis.window.Capacitor = {
                isNativePlatform: () => false,
                getPlatform: () => 'web',
            }
        })
    })
})
