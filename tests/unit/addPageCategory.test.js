import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AddPage } from '../../src/js/pages/addPage.js'
import { CategoryManager } from '../../src/js/categoryManager.js'

describe('AddPage - R1 預設支出分類與分類隔離', () => {
    let app, addPage, container, categoryManager

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'app-container'
        document.body.innerHTML = ''
        document.body.appendChild(container)
        sessionStorage.clear()

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
            },
        }

        addPage = new AddPage(app)
    })

    it('新增紀錄（支出模式）時，預設選取分類「飲食」且該分類按鈕為 active', async () => {
        await addPage.render(new URLSearchParams())

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat).not.toBeNull()
        expect(selectedCat.textContent).toContain('飲食')

        const foodBtn = document.querySelector(
            '.category-button[data-category-id="food"]'
        )
        expect(foodBtn).not.toBeNull()
        expect(foodBtn.classList.contains('active')).toBe(true)
    })

    it('進入收入模式時（?type=income），維持無預設分類（顯示「選擇分類」）且無任何按鈕被選中', async () => {
        await addPage.render(new URLSearchParams('type=income'))

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat).not.toBeNull()
        expect(selectedCat.textContent).toContain('選擇分類')

        const activeBtns = document.querySelectorAll(
            '.category-button.active, .category-button.active-income'
        )
        expect(activeBtns.length).toBe(0)
    })

    it('從支出模式切換至收入模式時，清空預設分類為 null 並顯示「選擇分類」，不殘留飲食分類', async () => {
        await addPage.render(new URLSearchParams())

        // 初始支出模式為飲食
        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat.textContent).toContain('飲食')

        // 點擊切換為收入模式
        const incomeBtn = document.getElementById('add-type-income')
        expect(incomeBtn).not.toBeNull()
        incomeBtn.click()

        expect(selectedCat.textContent).toContain('選擇分類')
        expect(selectedCat.textContent).not.toContain('飲食')

        const activeBtns = document.querySelectorAll(
            '.category-button.active, .category-button.active-income'
        )
        expect(activeBtns.length).toBe(0)
    })

    it('從收入模式切換回支出模式時，重新自動選取「飲食」', async () => {
        await addPage.render(new URLSearchParams())

        const incomeBtn = document.getElementById('add-type-income')
        const expenseBtn = document.getElementById('add-type-expense')
        const selectedCat = document.getElementById('add-selected-category')

        // 切換至收入
        incomeBtn.click()
        expect(selectedCat.textContent).toContain('選擇分類')

        // 切換回支出
        expenseBtn.click()
        expect(selectedCat.textContent).toContain('飲食')

        const foodBtn = document.querySelector(
            '.category-button[data-category-id="food"]'
        )
        expect(foodBtn.classList.contains('active')).toBe(true)
    })

    it('編輯既有支出紀錄模式時，嚴格保留該紀錄既有的分類（如 traffic），不被「飲食」預設值覆蓋', async () => {
        const mockExistingRecord = {
            id: 101,
            type: 'expense',
            amount: 150,
            category: 'traffic',
            date: '2026-03-01',
            description: '搭捷運',
        }
        app.dataService.getRecords.mockResolvedValue([mockExistingRecord])
        app.dataService.getRecord.mockResolvedValue(mockExistingRecord)

        await addPage.render(new URLSearchParams('id=101'))

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat.textContent).toContain('交通')
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
    })

    it('編輯既有收入紀錄模式時，嚴格保留該紀錄既有的分類（如 salary）', async () => {
        const mockExistingRecord = {
            id: 102,
            type: 'income',
            amount: 60000,
            category: 'salary',
            date: '2026-03-01',
            description: '月薪發放',
        }
        app.dataService.getRecords.mockResolvedValue([mockExistingRecord])
        app.dataService.getRecord.mockResolvedValue(mockExistingRecord)

        await addPage.render(new URLSearchParams('id=102'))

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat.textContent).toContain('薪水')

        const salaryBtn = document.querySelector(
            '.category-button[data-category-id="salary"]'
        )
        expect(salaryBtn).not.toBeNull()
        expect(salaryBtn.classList.contains('active-income')).toBe(true)
    })

    it('外掛或跨頁面透過 sessionStorage 傳入暫存分類時（如 life），優先保留且不被預設 food 覆蓋', async () => {
        sessionStorage.setItem(
            'temp_add_data',
            JSON.stringify({
                type: 'expense',
                amount: 300,
                category: 'life',
                description: '超市日用品',
            })
        )

        await addPage.render(new URLSearchParams())

        const selectedCat = document.getElementById('add-selected-category')
        expect(selectedCat.textContent).toContain('日常')
        expect(selectedCat.textContent).not.toContain('飲食')

        const lifeBtn = document.querySelector(
            '.category-button[data-category-id="life"]'
        )
        expect(lifeBtn).not.toBeNull()
        expect(lifeBtn.classList.contains('active')).toBe(true)
    })

    it('若使用者隱藏了 food 分類，getDefaultExpenseCategory 能夠優雅回退至第一個可見支出分類', async () => {
        // 將 food 設定為隱藏分類
        categoryManager.hiddenCategories = { expense: ['food'], income: [] }

        await addPage.render(new URLSearchParams())

        const selectedCat = document.getElementById('add-selected-category')
        // 預設 expense 的第二個分類為 'life' (日常)
        expect(selectedCat.textContent).toContain('日常')
        expect(selectedCat.textContent).not.toContain('飲食')
    })
})
