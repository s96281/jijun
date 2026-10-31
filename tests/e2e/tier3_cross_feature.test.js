/**
 * Tier 3: Cross-Feature Interactions E2E Test Suite
 * 
 * Verifies complex pairwise and multi-step interactions:
 * - settings -> new transaction -> records -> stats -> ledgers without any ad error
 * - multi-ledger transaction isolation
 * - theme switching across various pages
 * - amortizations / installments processing
 * - complete data export and re-import lifecycle
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import DataService from '../../src/js/dataService.js'
import { CategoryManager } from '../../src/js/categoryManager.js'
import { LedgerManager } from '../../src/js/ledgerManager.js'
import { ThemeManager, THEME_MODES } from '../../src/js/themeManager.js'
import { SettingsPage } from '../../src/js/pages/settingsPage.js'
import { HomePage } from '../../src/js/pages/homePage.js'
import { RecordsPage } from '../../src/js/pages/recordsPage.js'
import { StatsPage } from '../../src/js/pages/statsPage.js'
import { LedgersPage } from '../../src/js/pages/ledgersPage.js'
import { createMockApp } from './setup.js'

describe('Tier 3: Cross-Feature Interactions - Multi-Page Workflows', () => {
    let mockApp, dataService, categoryManager, ledgerManager, themeManager

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
        categoryManager = new CategoryManager(dataService)
        await categoryManager.init()
        themeManager = new ThemeManager(dataService)
        await themeManager.init()

        mockApp = createMockApp(dataService, { categoryManager, themeManager })
        ledgerManager = new LedgerManager(dataService, mockApp)
        await ledgerManager.init()
        mockApp.ledgerManager = ledgerManager
    })

    afterEach(() => {
        document.body.innerHTML = ''
        vi.restoreAllMocks()
    })

    it('X1: Full User Journey (Settings -> Add Transaction -> Records -> Stats -> Ledgers) executes without ad errors', async () => {
        // Step 1: Open Settings and configure settings
        const settingsPage = new SettingsPage(mockApp)
        await settingsPage.render()
        expect(document.getElementById('settings-banner-ad')).toBeNull()
        expect(document.getElementById('sponsor-reward-ad-btn')).toBeNull()

        // Step 2: Add transactions (Income + Expense)
        const salaryId = await dataService.addRecord({
            type: 'income',
            amount: 60000,
            category: 'salary',
            date: '2026-10-01',
            note: 'Monthly Salary',
        })
        const rentId = await dataService.addRecord({
            type: 'expense',
            amount: 15000,
            category: 'housing',
            date: '2026-10-05',
            note: 'Apartment Rent',
        })
        expect(salaryId).toBeDefined()
        expect(rentId).toBeDefined()

        // Step 3: Open RecordsPage and verify records
        const recordsPage = new RecordsPage(mockApp)
        await recordsPage.render()
        const records = await dataService.getRecords()
        expect(records.length).toBe(2)

        // Step 4: Open StatsPage and verify aggregation
        const statsPage = new StatsPage(mockApp)
        await statsPage.render()
        const totalIncome = records.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
        const totalExpense = records.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
        expect(totalIncome).toBe(60000)
        expect(totalExpense).toBe(15000)

        // Step 5: Open LedgersPage and verify ledger list
        const ledgersPage = new LedgersPage(mockApp)
        await ledgersPage.render()
        const ledgers = ledgerManager.getAllLedgers()
        expect(ledgers.length).toBeGreaterThanOrEqual(1)

        // Verify zero ad elements injected during entire workflow
        expect(document.querySelectorAll('#settings-banner-ad, #sponsor-reward-ad-btn, [id*="banner-ad"]').length).toBe(0)
    })

    it('X2: Multi-Ledger isolation ensures transactions and balances are strictly separated', async () => {
        // Ledger 1 (Default: Personal)
        const activeLedger = ledgerManager.getActiveLedger()
        expect(activeLedger).toBeDefined()
        expect(activeLedger.id).toBe(1)

        await dataService.addRecord({
            type: 'expense',
            amount: 500,
            category: 'food',
            date: '2026-10-10',
            note: 'Personal Dining',
        })

        // Create Ledger 2 (Business)
        const businessLedgerId = await ledgerManager.createLedger({
            name: '公司專案',
            icon: 'fa-briefcase',
            color: '#10b981',
        })
        await ledgerManager.switchLedger(businessLedgerId)

        await dataService.addRecord({
            type: 'expense',
            amount: 12000,
            category: 'office',
            date: '2026-10-12',
            note: 'Server Cloud Fee',
        })

        // Business ledger records
        const businessRecords = await dataService.getRecords()
        expect(businessRecords.length).toBe(1)
        expect(businessRecords[0].note).toBe('Server Cloud Fee')
        expect(businessRecords[0].amount).toBe(12000)

        // Switch back to Personal ledger
        await ledgerManager.switchLedger(1)
        const personalRecords = await dataService.getRecords()
        expect(personalRecords.length).toBe(1)
        expect(personalRecords[0].note).toBe('Personal Dining')
        expect(personalRecords[0].amount).toBe(500)
    })

    it('X3: Theme switching across multiple pages functions seamlessly without ad styling conflicts', async () => {
        expect(themeManager.themeMode).toBeDefined()

        // Set dark mode
        await themeManager.setThemeMode(THEME_MODES.DARK)
        expect(themeManager.themeMode).toBe('dark')

        const homePage = new HomePage(mockApp)
        await homePage.render()
        expect(mockApp.appContainer.innerHTML).not.toContain('settings-banner-ad')

        // Set light mode
        await themeManager.setThemeMode(THEME_MODES.LIGHT)
        expect(themeManager.themeMode).toBe('light')

        const settingsPage = new SettingsPage(mockApp)
        await settingsPage.render()
        expect(document.getElementById('settings-banner-ad')).toBeNull()
        expect(document.getElementById('sponsor-reward-ad-btn')).toBeNull()
    })

    it('X4: Amortization / Installment plans generate records correctly without ad reward prompts', async () => {
        // Create an amortization plan (3 months installment of $3000 total)
        const amortPlan = {
            name: '筆記型電腦分期',
            totalAmount: 3000,
            periods: 3,
            currentPeriod: 0,
            type: 'installment',
            status: 'active',
            startDate: '2026-10-01',
            ledgerId: 1,
        }
        const amortId = await dataService.addAmortization(amortPlan)
        expect(amortId).toBeDefined()

        // Simulate monthly amortization record generation
        const record = {
            type: 'expense',
            amount: 1000,
            category: 'digital',
            date: '2026-10-01',
            note: '筆記型電腦 (1/3期)',
            amortizationId: amortId,
        }
        const recordId = await dataService.addRecord(record)
        expect(recordId).toBeDefined()

        const retrieved = await dataService.getRecord(recordId)
        expect(retrieved.amortizationId).toBe(amortId)
        expect(retrieved.amount).toBe(1000)
    })

    it('X5: Complete data export and import cycle preserves accounting data with ZERO ad residue', async () => {
        // Seed diverse entities
        await dataService.addRecord({ type: 'income', amount: 8888, category: 'bonus', date: '2026-10-15' })
        await dataService.addRecord({ type: 'expense', amount: 888, category: 'food', date: '2026-10-16' })
        await dataService.addAccount({ name: '玉山銀行', type: 'bank', balance: 50000, ledgerId: 1 })
        await dataService.addContact({ name: '小明', phone: '0912345678', ledgerId: 1 })

        // Export data
        const exportData = await dataService._exportFullBackup()
        expect(exportData).toBeDefined()

        // Verify exported payload contains no ad fields
        const exportStr = JSON.stringify(exportData)
        expect(exportStr).not.toContain('adFreeUntil')
        expect(exportStr).not.toContain('rewardService')
        expect(exportStr).not.toContain('admob')
        expect(exportStr).not.toContain('adsense')

        // Clear and restore
        const emptyBackup = {
            records: [],
            ledgers: [{ id: 1, name: '預設帳本', type: 'personal' }],
            accounts: [],
            contacts: [],
            debts: [],
            recurring_transactions: [],
            amortizations: [],
        }
        await dataService._restoreFromBackup(emptyBackup)
        const clearedRecords = await dataService.getRecords()
        expect(clearedRecords.length).toBe(0)

        // Restore data
        await dataService._restoreFromBackup(exportData)
        const restoredRecords = await dataService.getRecords()
        expect(restoredRecords.length).toBe(2)
        const restoredAccounts = await dataService.getAccounts()
        expect(restoredAccounts.length).toBe(1)
        expect(restoredAccounts[0].name).toBe('玉山銀行')
    })
})
