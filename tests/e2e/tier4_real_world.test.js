/**
 * Tier 4: Real-World Application Scenarios E2E Test Suite
 * 
 * Verifies realistic, complex end-to-end user lifecycles:
 * - Scenario 1: New user onboarding, daily expense tracking, and monthly summary
 * - Scenario 2: Multi-account setup, credit card expense, and payment transfer
 * - Scenario 3: Vacation travel project with independent ledger and custom categories
 * - Scenario 4: Debt & lending management with friend AA bill splitting
 * - Scenario 5: Full accounting audit, settings customization, and cross-device migration
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
import { createMockApp } from './setup.js'

describe('Tier 4: Real-World Application Scenarios - End-to-End User Workflows', () => {
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

    it('Scenario 1: New user onboarding, daily expense tracking, and monthly net savings summary', async () => {
        // 1. Initial wallet account
        const walletId = await dataService.addAccount({
            name: '現金錢包',
            type: 'cash',
            balance: 10000,
            ledgerId: 1,
        })
        expect(walletId).toBeDefined()

        // 2. Log daily expenses over a week
        const expenses = [
            { type: 'expense', amount: 80, category: 'food', date: '2026-10-20', note: '早餐蛋餅' },
            { type: 'expense', amount: 150, category: 'food', date: '2026-10-20', note: '午餐排骨飯' },
            { type: 'expense', amount: 220, category: 'food', date: '2026-10-20', note: '晚餐義大利麵' },
            { type: 'expense', amount: 1450, category: 'shopping', date: '2026-10-22', note: '全聯超市買菜' },
            { type: 'expense', amount: 500, category: 'transport', date: '2026-10-23', note: '悠遊卡加值' },
        ]
        for (const exp of expenses) {
            await dataService.addRecord({ ...exp, accountId: walletId })
        }

        // 3. Record monthly salary income
        await dataService.addRecord({
            type: 'income',
            amount: 45000,
            category: 'salary',
            date: '2026-10-25',
            note: '十月份薪資',
            accountId: walletId,
        })

        // 4. Verify monthly summary
        const records = await dataService.getRecords()
        expect(records.length).toBe(6)

        const totalIncome = records.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0)
        const totalExpense = records.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0)
        const netSavings = totalIncome - totalExpense

        expect(totalIncome).toBe(45000)
        expect(totalExpense).toBe(2400)
        expect(netSavings).toBe(42600)

        // 5. Verify zero ad prompts on Home and Stats views
        const homePage = new HomePage(mockApp)
        await homePage.render()
        expect(document.getElementById('settings-banner-ad')).toBeNull()

        const statsPage = new StatsPage(mockApp)
        await statsPage.render()
        expect(document.querySelectorAll('[id*="banner-ad"]').length).toBe(0)
    })

    it('Scenario 2: Multi-account setup, credit card purchase, and bank transfer settlement', async () => {
        // 1. Setup checking account and credit card account
        const bankId = await dataService.addAccount({
            name: '國泰世華銀行',
            type: 'bank',
            balance: 100000,
            ledgerId: 1,
        })
        const creditCardId = await dataService.addAccount({
            name: '台新信用卡',
            type: 'credit',
            balance: 0,
            creditLimit: 50000,
            ledgerId: 1,
        })

        // 2. Credit card purchase
        await dataService.addRecord({
            type: 'expense',
            amount: 3500,
            category: 'shopping',
            date: '2026-10-15',
            note: '秋季換季外套',
            accountId: creditCardId,
        })

        // 3. Payment settlement (bank transfer to pay off credit card)
        await dataService.addRecord({
            type: 'expense',
            amount: 3500,
            category: 'debt_payment',
            date: '2026-10-28',
            note: '繳納信用卡帳單',
            accountId: bankId,
        })
        await dataService.addRecord({
            type: 'income',
            amount: 3500,
            category: 'debt_collection',
            date: '2026-10-28',
            note: '信用卡帳單沖銷入帳',
            accountId: creditCardId,
        })

        // 4. Verify accounts and transactions
        const accounts = await dataService.getAccounts()
        expect(accounts.length).toBe(2)

        const allRecords = await dataService.getRecords()
        expect(allRecords.length).toBe(3)
        expect(document.getElementById('settings-banner-ad')).toBeNull()
    })

    it('Scenario 3: Vacation travel project with independent ledger and custom categories', async () => {
        // 1. Create dedicated travel ledger
        const travelLedgerId = await ledgerManager.createLedger({
            name: '東京秋天賞楓自由行',
            icon: 'fa-plane',
            color: '#f97316',
        })
        expect(travelLedgerId).toBeDefined()
        await ledgerManager.switchLedger(travelLedgerId)

        // 2. Add custom trip categories
        await categoryManager.addCustomCategory('expense', {
            id: 'flight',
            name: '機票與交通',
            icon: 'fa-plane-departure',
            color: '#0284c7',
            isCustom: true,
        })
        await categoryManager.addCustomCategory('expense', {
            id: 'hotel',
            name: '溫泉旅館住宿',
            icon: 'fa-hotel',
            color: '#e11d48',
            isCustom: true,
        })

        // 3. Log trip expenses
        await dataService.addRecord({ type: 'expense', amount: 16000, category: 'flight', date: '2026-10-01', note: '星宇航空來回機票' })
        await dataService.addRecord({ type: 'expense', amount: 22000, category: 'hotel', date: '2026-10-02', note: '箱根溫泉飯店 2 泊' })
        await dataService.addRecord({ type: 'expense', amount: 6500, category: 'shopping', date: '2026-10-03', note: '銀座伴手禮' })

        const tripRecords = await dataService.getRecords()
        expect(tripRecords.length).toBe(3)
        const tripTotal = tripRecords.reduce((sum, r) => sum + r.amount, 0)
        expect(tripTotal).toBe(44500)

        // 4. Switch back to Default ledger and confirm isolation
        await ledgerManager.switchLedger(1)
        const defaultRecords = await dataService.getRecords()
        expect(defaultRecords.length).toBe(0)
    })

    it('Scenario 4: Debt & lending management with friend AA bill splitting', async () => {
        // 1. Create contacts
        const alice = await dataService.addContact({ name: 'Alice', phone: '0911111111', ledgerId: 1 })
        const bob = await dataService.addContact({ name: 'Bob', phone: '0922222222', ledgerId: 1 })

        // 2. User paid dinner $1800, Alice owes $600, Bob owes $600
        const debtAlice = await dataService.addDebt({
            contactId: alice.id || alice,
            type: 'receivable',
            amount: 600,
            note: '聚餐分帳 (Alice)',
            date: '2026-10-18',
            settled: false,
            ledgerId: 1,
        })
        const debtBob = await dataService.addDebt({
            contactId: bob.id || bob,
            type: 'receivable',
            amount: 600,
            note: '聚餐分帳 (Bob)',
            date: '2026-10-18',
            settled: false,
            ledgerId: 1,
        })
        expect(debtAlice).toBeDefined()
        expect(debtBob).toBeDefined()

        // 3. Alice pays back $600
        const aliceDebtId = debtAlice.id || debtAlice
        await dataService.updateDebt(aliceDebtId, {
            settled: true,
            settledDate: '2026-10-19',
        })

        // 4. Verify debt states
        const allDebts = await dataService.getDebts()
        expect(allDebts.length).toBe(2)
        const aDebt = allDebts.find(d => d.id === aliceDebtId)
        const bDebt = allDebts.find(d => d.id === (debtBob.id || debtBob))

        expect(aDebt.settled).toBe(true)
        expect(bDebt.settled).toBe(false)
    })

    it('Scenario 5: Full accounting audit, settings customization, and cross-device migration', async () => {
        // 1. Customize settings
        await themeManager.setThemeMode(THEME_MODES.DARK)
        await dataService.saveSetting('defaultPeriod', 'month')
        await dataService.saveSetting('calculatorDisabled', true)

        // 2. Add realistic records
        await dataService.addRecord({ type: 'income', amount: 50000, category: 'salary', date: '2026-10-01' })
        await dataService.addRecord({ type: 'expense', amount: 3000, category: 'food', date: '2026-10-10' })
        await dataService.addRecord({ type: 'expense', amount: 2000, category: 'transport', date: '2026-10-15' })

        // 3. Export full database
        const backupPayload = await dataService._exportFullBackup()
        expect(backupPayload.records.length).toBe(3)
        expect(backupPayload.settings).toBeDefined()

        // Verify exported payload is completely free of ad artifacts
        const jsonStr = JSON.stringify(backupPayload)
        expect(jsonStr).not.toContain('adFreeUntil')
        expect(jsonStr).not.toContain('rewardService')
        expect(jsonStr).not.toContain('admob')
        expect(jsonStr).not.toContain('adsense')

        // 4. Simulate wipe & device migration restore
        const blankBackup = {
            records: [],
            ledgers: [{ id: 1, name: '預設帳本', type: 'personal' }],
            accounts: [],
            contacts: [],
            debts: [],
            recurring_transactions: [],
            amortizations: [],
        }
        await dataService._restoreFromBackup(blankBackup)
        expect((await dataService.getRecords()).length).toBe(0)

        await dataService._restoreFromBackup(backupPayload)
        const restoredRecords = await dataService.getRecords()
        expect(restoredRecords.length).toBe(3)

        // 5. Render settings page after restore to verify clean state
        const settingsPage = new SettingsPage(mockApp)
        await settingsPage.render()
        expect(document.getElementById('settings-banner-ad')).toBeNull()
        expect(document.getElementById('sponsor-reward-ad-btn')).toBeNull()
    })
})
