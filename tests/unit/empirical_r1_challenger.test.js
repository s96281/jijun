import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AddPage } from '../../src/js/pages/addPage.js'
import { CategoryManager } from '../../src/js/categoryManager.js'

// Mock showToast to observe validation calls empirically
const mockShowToast = vi.fn()
vi.mock('../../src/js/utils.js', async () => {
    const actual = await vi.importActual('../../src/js/utils.js')
    return {
        ...actual,
        showToast: (...args) => mockShowToast(...args),
    }
})

describe('Empirical Challenger R1: Default Expense Category to Food & Cross-Type Isolation', () => {
    let app, addPage, container, categoryManager

    beforeEach(() => {
        mockShowToast.mockClear()
        sessionStorage.clear()

        container = document.createElement('div')
        container.id = 'app-container'
        document.body.innerHTML = ''
        document.body.appendChild(container)

        categoryManager = new CategoryManager({
            getCategorySetting: vi.fn().mockResolvedValue(null),
            saveCategorySetting: vi.fn().mockResolvedValue(true),
        })
        categoryManager.customCategories = { expense: [], income: [] }
        categoryManager.categoryOrder = { expense: [], income: [] }
        categoryManager.hiddenCategories = { expense: [], income: [] }

        app = {
            appContainer: container,
            aiService: {},
            updateNavAddIcon: vi.fn(),
            dataService: {
                getSetting: vi.fn().mockImplementation(async key => {
                    if (key === 'calculatorModeEnabled') return { value: true }
                    if (key === 'advancedAccountModeEnabled')
                        return { value: false }
                    return { value: false }
                }),
                getContacts: vi.fn().mockResolvedValue([]),
                getAccounts: vi
                    .fn()
                    .mockResolvedValue([
                        { id: 1, name: '現金', type: 'cash', color: '#10b981' },
                    ]),
                getCategories: vi.fn().mockResolvedValue([]),
                getRecords: vi.fn().mockResolvedValue([]),
                getRecord: vi.fn().mockResolvedValue(null),
                getDebt: vi.fn().mockResolvedValue(null),
                getAmortization: vi.fn().mockResolvedValue(null),
                getAllGroupMeta: vi.fn().mockResolvedValue([]),
                getGroups: vi.fn().mockResolvedValue([]),
                addRecord: vi.fn().mockResolvedValue(1001),
                updateRecord: vi.fn().mockResolvedValue(true),
            },
            categoryManager,
            ledgerManager: {
                getActiveLedger: vi
                    .fn()
                    .mockReturnValue({ id: 1, name: '預設帳本' }),
                getAllLedgers: vi.fn().mockReturnValue([{ id: 1 }]),
            },
            groupManager: {
                createGroup: vi.fn().mockResolvedValue('g-new'),
            },
            debtManager: {},
            quickSelectManager: {
                render: vi.fn(),
                addRecord: vi.fn(),
            },
        }

        addPage = new AddPage(app)
    })

    // ── Challenge 1 ──────────────────────────────────────────────────────────
    it('Challenge 1: New record in Expense mode -> check DOM #add-selected-category, verify text includes "飲食", verify .category-button[data-category-id="food"] has "active"', async () => {
        await addPage.render(new URLSearchParams())

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat).not.toBeNull()
        expect(selectedCat.textContent.trim()).toContain('飲食')

        const foodBtn = document.querySelector(
            '.category-button[data-category-id="food"]'
        )
        expect(foodBtn).not.toBeNull()
        expect(foodBtn.classList.contains('active')).toBe(true)

        // Verify other expense buttons are not active
        const otherActiveBtns = document.querySelectorAll(
            '.category-button:not([data-category-id="food"]).active'
        )
        expect(otherActiveBtns.length).toBe(0)
    })

    // ── Challenge 2 ──────────────────────────────────────────────────────────
    it('Challenge 2: Switch to Income mode -> verify DOM #add-selected-category shows "選擇分類", verify no category button is active, verify that clicking keypad save with an amount triggers validation error toast "請輸入金額並選擇分類" and does not save with category "food"', async () => {
        await addPage.render(new URLSearchParams())

        // Initial check: Expense mode defaulted to food
        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat.textContent).toContain('飲食')

        // Switch to Income mode
        const incomeBtn = document.getElementById('add-type-income')
        expect(incomeBtn).not.toBeNull()
        incomeBtn.click()

        // 1. Verify DOM shows "選擇分類" and NOT "飲食"
        expect(selectedCat.textContent.trim()).toContain('選擇分類')
        expect(selectedCat.textContent).not.toContain('飲食')

        // 2. Verify NO category button is active
        const activeBtns = document.querySelectorAll(
            '.category-button.active, .category-button.active-income'
        )
        expect(activeBtns.length).toBe(0)

        // 3. Input amount via keypad: '5', '0', '0'
        const key5 = document.querySelector('.keypad-btn[data-key="5"]')
        const key0 = document.querySelector('.keypad-btn[data-key="0"]')
        const keySave = document.querySelector('.keypad-btn[data-key="save"]')
        expect(key5).not.toBeNull()
        expect(key0).not.toBeNull()
        expect(keySave).not.toBeNull()

        key5.click()
        key0.click()
        key0.click()

        // Verify amount display updated
        const amountDisplay = document.getElementById('add-amount-display')
        expect(amountDisplay).not.toBeNull()
        expect(amountDisplay.textContent).toContain('500')

        // Click save
        mockShowToast.mockClear()
        keySave.click()

        // 4. Verify validation error toast was triggered
        expect(mockShowToast).toHaveBeenCalledTimes(1)
        expect(mockShowToast).toHaveBeenCalledWith(
            '請輸入金額並選擇分類',
            'error'
        )

        // 5. Verify addRecord was NEVER called (does not save with 'food' or any category)
        expect(app.dataService.addRecord).not.toHaveBeenCalled()
    })

    // ── Challenge 3 ──────────────────────────────────────────────────────────
    it('Challenge 3: Switch back to Expense mode -> verify re-default to "food" and active class, and saving succeeds with category "food"', async () => {
        await addPage.render(new URLSearchParams())

        const incomeBtn = document.getElementById('add-type-income')
        const expenseBtn = document.getElementById('add-type-expense')
        const selectedCat = document.getElementById('add-selected-category')

        // Switch to income
        incomeBtn.click()
        expect(selectedCat.textContent).toContain('選擇分類')

        // Switch back to expense
        expenseBtn.click()

        // 1. Verify re-default to 'food'
        expect(selectedCat.textContent.trim()).toContain('飲食')

        // 2. Verify food button has 'active' class
        const foodBtn = document.querySelector(
            '.category-button[data-category-id="food"]'
        )
        expect(foodBtn).not.toBeNull()
        expect(foodBtn.classList.contains('active')).toBe(true)

        // 3. Enter amount and click save
        const key1 = document.querySelector('.keypad-btn[data-key="1"]')
        const key0 = document.querySelector('.keypad-btn[data-key="0"]')
        const keySave = document.querySelector('.keypad-btn[data-key="save"]')
        key1.click()
        key0.click()
        key0.click()

        mockShowToast.mockClear()
        keySave.click()

        // 4. Verify saved with category 'food'
        expect(app.dataService.addRecord).toHaveBeenCalledTimes(1)
        expect(app.dataService.addRecord).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'expense',
                category: 'food',
                amount: 100,
            })
        )
    })

    // ── Challenge 4 ──────────────────────────────────────────────────────────
    it('Challenge 4: Mount with ?type=income -> verify no category is selected, save fails with validation toast, selecting category works, switching to expense defaults to food', async () => {
        await addPage.render(new URLSearchParams('type=income'))

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat).not.toBeNull()

        // 1. Verify "選擇分類" is shown
        expect(selectedCat.textContent.trim()).toContain('選擇分類')
        expect(selectedCat.textContent).not.toContain('飲食')

        // 2. Verify no active category button
        const activeBtns = document.querySelectorAll(
            '.category-button.active, .category-button.active-income'
        )
        expect(activeBtns.length).toBe(0)

        // 3. Keypad save without category fails
        const key2 = document.querySelector('.keypad-btn[data-key="2"]')
        const keySave = document.querySelector('.keypad-btn[data-key="save"]')
        key2.click()
        keySave.click()
        expect(mockShowToast).toHaveBeenCalledWith(
            '請輸入金額並選擇分類',
            'error'
        )
        expect(app.dataService.addRecord).not.toHaveBeenCalled()

        // 4. Select an income category (e.g. salary)
        const salaryBtn = document.querySelector(
            '.category-button[data-category-id="salary"]'
        )
        expect(salaryBtn).not.toBeNull()
        salaryBtn.click()

        expect(selectedCat.textContent.trim()).toContain('薪水')
        expect(salaryBtn.classList.contains('active-income')).toBe(true)

        // 5. Switch to expense -> should default to 'food', NOT keep 'salary'
        const expenseBtn = document.getElementById('add-type-expense')
        expenseBtn.click()
        expect(selectedCat.textContent.trim()).toContain('飲食')
        expect(selectedCat.textContent).not.toContain('薪水')

        const foodBtn = document.querySelector(
            '.category-button[data-category-id="food"]'
        )
        expect(foodBtn.classList.contains('active')).toBe(true)
    })

    // ── Challenge 5 ──────────────────────────────────────────────────────────
    it('Challenge 5: Edit mode for expense record (traffic & custom category) -> verify category is preserved and "food" is NOT applied, type toggle buttons are disabled, saving preserves original category', async () => {
        const mockTrafficRecord = {
            id: 201,
            type: 'expense',
            amount: 250,
            category: 'traffic',
            date: '2026-03-01',
            description: '高鐵票',
        }
        app.dataService.getRecords.mockResolvedValue([mockTrafficRecord])
        app.dataService.getRecord.mockResolvedValue(mockTrafficRecord)

        await addPage.render(new URLSearchParams('id=201'))

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat.textContent.trim()).toContain('交通')
        expect(selectedCat.textContent).not.toContain('飲食')

        const trafficBtn = document.querySelector(
            '.category-button[data-category-id="traffic"]'
        )
        expect(trafficBtn).not.toBeNull()
        expect(trafficBtn.classList.contains('active')).toBe(true)

        const foodBtn = document.querySelector(
            '.category-button[data-category-id="food"]'
        )
        expect(foodBtn.classList.contains('active')).toBe(false)

        // Verify type buttons do NOT allow changing type in edit mode
        const incomeBtn = document.getElementById('add-type-income')
        incomeBtn.click()
        // Still expense and traffic
        expect(selectedCat.textContent.trim()).toContain('交通')

        // Save in edit mode -> updates with 'traffic'
        const keySave = document.querySelector('.keypad-btn[data-key="save"]')
        keySave.click()

        expect(app.dataService.updateRecord).toHaveBeenCalledWith(
            201,
            expect.objectContaining({
                type: 'expense',
                category: 'traffic',
                amount: 250,
            })
        )
    })

    // ── Challenge 6 ──────────────────────────────────────────────────────────
    it('Challenge 6: Edit mode for income record (salary) -> verify category is preserved and "food" is NOT applied, saving preserves original category', async () => {
        const mockSalaryRecord = {
            id: 202,
            type: 'income',
            amount: 70000,
            category: 'salary',
            date: '2026-03-01',
            description: '三月薪水',
        }
        app.dataService.getRecords.mockResolvedValue([mockSalaryRecord])
        app.dataService.getRecord.mockResolvedValue(mockSalaryRecord)

        await addPage.render(new URLSearchParams('id=202'))

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat.textContent.trim()).toContain('薪水')
        expect(selectedCat.textContent).not.toContain('飲食')
        expect(selectedCat.textContent).not.toContain('選擇分類')

        const salaryBtn = document.querySelector(
            '.category-button[data-category-id="salary"]'
        )
        expect(salaryBtn).not.toBeNull()
        expect(salaryBtn.classList.contains('active-income')).toBe(true)

        // Save in edit mode -> updates with 'salary'
        const keySave = document.querySelector('.keypad-btn[data-key="save"]')
        keySave.click()

        expect(app.dataService.updateRecord).toHaveBeenCalledWith(
            202,
            expect.objectContaining({
                type: 'income',
                category: 'salary',
                amount: 70000,
            })
        )
    })

    // ── Challenge 7 ──────────────────────────────────────────────────────────
    it('Challenge 7: Pre-filled category from sessionStorage (expense & income) -> verify pre-fill is respected and not overwritten by "food"', async () => {
        // 7a: Pre-filled expense category 'fun' (娛樂)
        sessionStorage.setItem(
            'temp_add_data',
            JSON.stringify({
                type: 'expense',
                amount: 400,
                category: 'fun',
                description: '電影票',
            })
        )

        await addPage.render(new URLSearchParams())

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat.textContent.trim()).toContain('娛樂')
        expect(selectedCat.textContent).not.toContain('飲食')

        const funBtn = document.querySelector(
            '.category-button[data-category-id="fun"]'
        )
        expect(funBtn).not.toBeNull()
        expect(funBtn.classList.contains('active')).toBe(true)

        const foodBtn = document.querySelector(
            '.category-button[data-category-id="food"]'
        )
        expect(foodBtn.classList.contains('active')).toBe(false)

        // 7b: Pre-filled income category 'invest' (投資)
        sessionStorage.setItem(
            'temp_add_data',
            JSON.stringify({
                type: 'income',
                amount: 1500,
                category: 'invest',
                description: '股票股利',
            })
        )

        await addPage.render(new URLSearchParams())

        const selectedCat2 = document.getElementById('add-selected-category')
        expect(selectedCat2.textContent.trim()).toContain('投資')
        expect(selectedCat2.textContent).not.toContain('選擇分類')
        expect(selectedCat2.textContent).not.toContain('飲食')

        const invBtn = document.querySelector(
            '.category-button[data-category-id="invest"]'
        )
        expect(invBtn).not.toBeNull()
        expect(invBtn.classList.contains('active-income')).toBe(true)
    })

    // ── Challenge 8 ──────────────────────────────────────────────────────────
    it('Challenge 8: Rapid alternating clicks between expense and income buttons -> verify state never desynchronizes (50 cycles)', async () => {
        await addPage.render(new URLSearchParams())

        const incomeBtn = document.getElementById('add-type-income')
        const expenseBtn = document.getElementById('add-type-expense')
        const selectedCat = document.getElementById('add-selected-category')

        // Test 50 alternating clicks
        for (let i = 0; i < 50; i++) {
            // Click income
            incomeBtn.click()
            expect(selectedCat.textContent.trim()).toContain('選擇分類')
            expect(selectedCat.textContent).not.toContain('飲食')
            const activeIncomeBtns = document.querySelectorAll(
                '.category-button.active, .category-button.active-income'
            )
            expect(activeIncomeBtns.length).toBe(0)

            // Click expense
            expenseBtn.click()
            expect(selectedCat.textContent.trim()).toContain('飲食')
            const foodBtn = document.querySelector(
                '.category-button[data-category-id="food"]'
            )
            expect(foodBtn).not.toBeNull()
            expect(foodBtn.classList.contains('active')).toBe(true)
        }

        // Now test alternating with manual category selection in between
        // 1. In expense mode, user picks 'life'
        const lifeBtn = document.querySelector(
            '.category-button[data-category-id="life"]'
        )
        if (lifeBtn) {
            lifeBtn.click()
            expect(selectedCat.textContent.trim()).toContain('日常')

            // Switch to income: life is an expense category, must reset to null
            incomeBtn.click()
            expect(selectedCat.textContent.trim()).toContain('選擇分類')
            expect(selectedCat.textContent).not.toContain('日常')

            // Pick income category 'bonus'
            const bonusBtn = document.querySelector(
                '.category-button[data-category-id="bonus"]'
            )
            if (bonusBtn) {
                bonusBtn.click()
                expect(selectedCat.textContent.trim()).toContain('獎金')

                // Switch back to expense: bonus is an income category, must reset to default 'food'
                expenseBtn.click()
                expect(selectedCat.textContent.trim()).toContain('飲食')
                expect(selectedCat.textContent).not.toContain('獎金')
                const activeFood = document.querySelector(
                    '.category-button[data-category-id="food"]'
                )
                expect(activeFood.classList.contains('active')).toBe(true)
            }
        }
    })

    // ── Challenge 9 (Stress & Edge cases): Hidden food fallback ──────────────
    it('Challenge 9 (Stress): If food is hidden by user, getDefaultExpenseCategory falls back to first visible expense category', async () => {
        categoryManager.hiddenCategories = {
            expense: ['food'],
            income: [],
        }

        await addPage.render(new URLSearchParams())

        const selectedCat = document.getElementById('add-selected-category')
        // In default CATEGORIES, after food comes 'life', 'traffic', 'fun', etc.
        const visibleExpense = categoryManager.getAllCategories('expense')
        const firstVisible = visibleExpense[0]

        expect(firstVisible.id).not.toBe('food')
        expect(selectedCat.textContent.trim()).toContain(firstVisible.name)
        expect(selectedCat.textContent).not.toContain('飲食')

        // Switch to income and back to expense -> should re-default to firstVisible
        const incomeBtn = document.getElementById('add-type-income')
        const expenseBtn = document.getElementById('add-type-expense')

        incomeBtn.click()
        expect(selectedCat.textContent.trim()).toContain('選擇分類')

        expenseBtn.click()
        expect(selectedCat.textContent.trim()).toContain(firstVisible.name)
        const firstBtn = document.querySelector(
            `.category-button[data-category-id="${firstVisible.id}"]`
        )
        expect(firstBtn.classList.contains('active')).toBe(true)
    })

    // ── Challenge 10 (Stress): Empty expense categories list ────────────────
    it('Challenge 10 (Stress): If all expense categories are somehow hidden/empty, handles gracefully without runtime error', async () => {
        // Hide all expense categories
        const allExp = categoryManager
            .getAllCategories('expense', true)
            .map(c => c.id)
        categoryManager.hiddenCategories = {
            expense: allExp,
            income: [],
        }

        // Should not throw
        await expect(
            addPage.render(new URLSearchParams())
        ).resolves.not.toThrow()

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat).not.toBeNull()
    })
})
