import {
    formatDate,
    formatDateToString,
    formatCurrency,
    showToast,
    escapeHTML,
    customConfirm,
    customAlert,
} from '../utils.js'
import { VirtualKeyboardDetector } from '../virtualKeyboardDetector.js'

export class AddPage {
    constructor(app) {
        this.app = app
        this._keypadListener = null
    }

    async render(params) {
        const recordId = params ? params.get('id') : null
        const isEditMode = !!recordId
        if (this.app.updateNavAddIcon) {
            this.app.updateNavAddIcon(isEditMode)
        }

        // 計算機模式設定（預設為啟用）
        const calculatorModeSetting = await this.app.dataService.getSetting(
            'calculatorModeEnabled'
        )
        const calculatorModeEnabled = calculatorModeSetting
            ? !!calculatorModeSetting.value
            : true

        // 根據計算機模式產生不同的鍵盤佈局
        const keypadGridCols = calculatorModeEnabled
            ? 'grid-cols-5'
            : 'grid-cols-4'
        const keypadKeys = calculatorModeEnabled
            ? [
                  '1',
                  '2',
                  '3',
                  '+',
                  'backspace',
                  '4',
                  '5',
                  '6',
                  '-',
                  'ac',
                  '7',
                  '8',
                  '9',
                  '×',
                  'save',
                  '00',
                  '0',
                  '.',
                  '÷',
              ]
            : [
                  '1',
                  '2',
                  '3',
                  'backspace',
                  '4',
                  '5',
                  '6',
                  'ac',
                  '7',
                  '8',
                  '9',
                  'save',
                  '00',
                  '0',
                  '.',
                  '',
              ]

        // Use a fixed container to ensure perfect pinning to the viewport (considering bottom nav on mobile)
        this.app.appContainer.innerHTML = `
            <div id="add-page-wrapper" class="fixed top-0 left-0 right-0 bottom-20 md:bottom-0 md:left-64 flex flex-col overflow-hidden bg-wabi-bg z-20">
                <!-- Scrollable Content Area -->
                <div class="flex-1 overflow-y-auto">
                    <div class="page active p-4 max-w-3xl mx-auto">
                        <!-- Header -->
                        <div class="flex items-center pb-2 justify-between">
                            <button id="add-page-close-btn" class="flex size-12 shrink-0 items-center justify-center">
                                <i class="fa-solid fa-xmark text-2xl text-wabi-text-primary"></i>
                            </button>
                            <h2 class="text-lg font-bold flex-1 text-center">${isEditMode ? '編輯紀錄' : '新增紀錄'}</h2>
                            <div class="flex items-center gap-2">
                                ${isEditMode ? '<button id="delete-record-btn" class="text-wabi-expense"><i class="fa-solid fa-trash-can"></i></button>' : ''}
                            </div>
                        </div>

                        <!-- Type Selector (Tabs) -->
                        <div class="flex h-10 w-full items-center justify-center rounded-lg bg-gray-200/50 p-1 mb-4">
                            <button id="add-type-expense" class="flex-1 h-full rounded-md px-3 py-1 text-sm font-medium bg-wabi-expense text-wabi-surface shadow-sm transition-all duration-200 ease-in-out">支出</button>
                            <button id="add-type-income" class="flex-1 h-full rounded-md px-3 py-1 text-sm font-medium text-wabi-text-secondary transition-all duration-200 ease-in-out">收入</button>
                        </div>

                        <!-- Selected Category & Amount Display -->
                        <div class="p-4">
                            <div class="flex items-center justify-between">
                                <div id="add-selected-category" class="flex items-center gap-4">
                                    <div class="flex items-center justify-center rounded-full bg-wabi-text-secondary/10 shrink-0 size-12">
                                        <i class="fa-solid fa-question text-3xl text-wabi-text-secondary"></i>
                                    </div>
                                    <p class="text-lg font-medium">選擇分類</p>
                                </div>
                                <div id="add-amount-display" class="text-wabi-expense tracking-light text-5xl font-bold">$0</div>
                            </div>
                        </div>

                        <!-- Categories -->
                        <div id="add-category-grid" class="px-4 mt-2 grid grid-cols-4 gap-4"></div>
                        <div class="h-8"></div> <!-- Spacer for better scrolling end experience -->
                    </div>
                </div>

                <!-- Note, Date, and Keypad -->
                <div id="keypad-container" class="shrink-0 w-full max-w-3xl mx-auto md:border-x md:border-t md:border-wabi-border md:rounded-t-xl md:shadow-[0_0_15px_rgba(0,0,0,0.05)] bg-wabi-keypad/80 text-wabi-primary z-20 transform translate-y-full transition-transform duration-300 ease-in-out">
                    <!-- Quick Select Container -->
                    <div class="flex items-start px-4 pt-2 gap-2">
                        <div id="quick-select-container" class="w-full grow hidden"></div>
                    </div>

                    <div class="flex items-center px-4 py-2 gap-2">
                        <label class="relative flex items-center gap-2 p-2 rounded-lg bg-wabi-surface/50">
                            <i class="fa-solid fa-calendar-days text-wabi-text-secondary"></i>
                            <span id="add-date-display" class="text-sm font-medium">${formatDate(formatDateToString(new Date()), 'short')}</span>
                            <input type="date" id="add-date-input" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                        </label>
                        <input id="add-note-input" class="w-full rounded-lg border-wabi-border bg-wabi-surface/80 placeholder:text-wabi-text-secondary focus:border-wabi-primary focus:ring-wabi-primary" placeholder="新增備註" type="text"/>
                        <button id="keypad-toggle-btn" class="p-2 rounded-lg bg-wabi-surface/50">
                            <i class="fa-solid fa-keyboard"></i>
                        </button>
                    </div>
                    <div id="keypad-grid" class="${keypadGridCols} gap-px bg-wabi-keypad/80">
                        ${keypadKeys.map(k => this.createKeypadButton(k, isEditMode, calculatorModeEnabled)).join('')}
                    </div>
                </div>
            </div>
        `
        await this.setupAddPageListeners(recordId, params)
    }

    async setupAddPageListeners(recordId, params) {
        const isEditMode = !!recordId
        let recordToEdit = null

        // 計算機模式設定（需在此處讀取以用於 handleKeypad，預設為啟用）
        const calculatorModeSetting = await this.app.dataService.getSetting(
            'calculatorModeEnabled'
        )
        const calculatorModeEnabled = calculatorModeSetting
            ? !!calculatorModeSetting.value
            : true

        let currentType = 'expense'
        let currentAmount = '0'
        let selectedCategory = null
        let currentDate = formatDateToString(new Date())
        let keypadGridOpen = false

        // Virtual keyboard state tracking
        let vkForcedHide = false
        let vkDetector = null

        const pageWrapper = document.getElementById('add-page-wrapper')
        const closeBtn = document.getElementById('add-page-close-btn')
        const expenseBtn = document.getElementById('add-type-expense')
        const incomeBtn = document.getElementById('add-type-income')
        const amountDisplay = document.getElementById('add-amount-display')
        const categoryGrid = document.getElementById('add-category-grid')
        const selectedCategoryUI = document.getElementById(
            'add-selected-category'
        )
        const dateInput = document.getElementById('add-date-input')
        const dateDisplay = document.getElementById('add-date-display')
        const noteInput = document.getElementById('add-note-input')
        const keypadContainer = document.getElementById('keypad-container')
        const keypadGrid = document.getElementById('keypad-grid')
        const keypadToggleBtn = document.getElementById('keypad-toggle-btn')
        const quickSelectContainer = document.getElementById(
            'quick-select-container'
        )

        // Back Button Logic
        const handleBack = () => {
            if (window.history.length > 1) {
                window.history.back()
            } else {
                window.location.hash = 'records'
            }
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', handleBack)
        }

        // Plugin Support: Pre-fill from Session Storage
        if (!recordId) {
            const tempDataStr = sessionStorage.getItem('temp_add_data')
            if (tempDataStr) {
                try {
                    const tempData = JSON.parse(tempDataStr)
                    if (tempData.type) currentType = tempData.type
                    if (tempData.amount)
                        currentAmount = tempData.amount.toString()
                    if (tempData.category) selectedCategory = tempData.category
                    if (tempData.description && noteInput)
                        noteInput.value = tempData.description
                    if (amountDisplay)
                        amountDisplay.textContent =
                            formatCurrency(currentAmount)
                    sessionStorage.removeItem('temp_add_data')
                } catch (e) {
                    console.error('Error applying temp data:', e)
                }
            }
        }

        // PWA Share Target & Query Param Pre-fill Support
        if (!recordId && params) {
            const amountParam = params.get('amount')
            const noteParam = params.get('note')
            const typeParam = params.get('type')

            if (
                typeParam &&
                (typeParam === 'expense' || typeParam === 'income')
            ) {
                currentType = typeParam
            }
            if (amountParam && !isNaN(parseFloat(amountParam))) {
                currentAmount = amountParam.toString()
                if (amountDisplay) {
                    amountDisplay.textContent = formatCurrency(currentAmount)
                }
            }
            if (noteParam && noteInput) {
                noteInput.value = noteParam
            }
        }

        // Helper: 取得預設支出分類（優先選用 'food'，若被使用者隱藏則回退至第一個可見支出分類）
        const getDefaultExpenseCategory = () => {
            if (this.app?.categoryManager?.getAllCategories) {
                const visible =
                    this.app.categoryManager.getAllCategories('expense')
                if (visible?.some(c => c.id === 'food')) return 'food'
                if (visible && visible.length > 0) return visible[0].id
            }
            return 'food'
        }

        // 新增紀錄模式下，支出類別預設選取「飲食」(food)；收入類別維持無預設分類
        if (!isEditMode && currentType === 'expense' && !selectedCategory) {
            selectedCategory = getDefaultExpenseCategory()
        }

        let calcPrev = null // 運算前值
        let calcOp = null // 當前運算子
        let calcNew = true // 是否剛開始輸入新數字

        const calculate = (a, op, b) => {
            const numA = parseFloat(a)
            const numB = parseFloat(b)
            switch (op) {
                case '+':
                    return numA + numB
                case '-':
                    return numA - numB
                case '×':
                    return numA * numB
                case '÷':
                    return numB !== 0 ? numA / numB : NaN
                default:
                    return numB
            }
        }

        const formatCalcResult = num => {
            if (isNaN(num) || !isFinite(num)) return '0'
            const result = parseFloat(num.toPrecision(12))
            return parseFloat(result.toFixed(2)).toString()
        }

        // 儲存按鈕動態切換：計算中顯示「＝」，否則顯示「儲存」/「更新」
        const updateSaveButtonUI = () => {
            const saveBtn = document.querySelector(
                '.keypad-btn[data-key="save"]'
            )
            if (!saveBtn || !calculatorModeEnabled) return
            if (calcOp !== null) {
                // 計算中：變成等號樣式
                saveBtn.innerHTML = '<span class="font-bold text-2xl">＝</span>'
                saveBtn.classList.remove('bg-wabi-accent', 'text-wabi-primary')
                saveBtn.classList.add('bg-amber-500', 'text-white')
            } else {
                // 正常狀態：顯示儲存/更新
                saveBtn.innerHTML = isEditMode
                    ? '<span class="font-bold">更新</span>'
                    : '<span class="font-bold">儲存</span>'
                saveBtn.classList.remove('bg-amber-500', 'text-white')
                saveBtn.classList.add('bg-wabi-accent', 'text-wabi-primary')
            }
        }

        const toggleKeypadGrid = force => {
            const shouldOpen = force === undefined ? !keypadGridOpen : force
            const icon = keypadToggleBtn.querySelector('i')
            if (shouldOpen) {
                keypadGrid.style.display = 'grid'
                keypadToggleBtn.classList.add(
                    'bg-wabi-accent',
                    'text-wabi-primary'
                )
                if (icon) {
                    icon.classList.remove('fa-keyboard')
                    icon.classList.add('fa-chevron-up')
                }
            } else {
                keypadGrid.style.display = 'none'
                keypadToggleBtn.classList.remove(
                    'bg-wabi-accent',
                    'text-wabi-primary'
                )
                if (icon) {
                    icon.classList.remove('fa-chevron-up')
                    icon.classList.add('fa-keyboard')
                }
            }
            keypadGridOpen = shouldOpen
        }

        keypadContainer.classList.remove('translate-y-full')

        // Initialize virtual keyboard detector
        vkDetector = new VirtualKeyboardDetector({
            onShow: () => {
                if (window.innerWidth < 768) {
                    vkForcedHide = true
                    toggleKeypadGrid(false)
                }
            },
            onHide: () => {
                if (vkForcedHide) {
                    vkForcedHide = false
                    toggleKeypadGrid(true)
                }
            },
            threshold: 150,
        })
        vkDetector.start()

        const updateTypeUI = () => {
            if (currentType === 'expense') {
                expenseBtn.classList.add(
                    'bg-wabi-expense',
                    'text-wabi-surface',
                    'shadow-sm'
                )
                incomeBtn.classList.remove(
                    'bg-wabi-income',
                    'text-wabi-surface',
                    'shadow-sm'
                )
                amountDisplay.classList.remove('text-wabi-income')
                amountDisplay.classList.add('text-wabi-expense')
            } else {
                incomeBtn.classList.add(
                    'bg-wabi-income',
                    'text-wabi-surface',
                    'shadow-sm'
                )
                expenseBtn.classList.remove(
                    'bg-wabi-expense',
                    'text-wabi-surface',
                    'shadow-sm'
                )
                amountDisplay.classList.remove('text-wabi-expense')
                amountDisplay.classList.add('text-wabi-income')
            }
            renderCategories()
            const category = this.app.categoryManager.getCategoryById(
                currentType,
                selectedCategory
            )
            updateSelectedCategoryUI(category)
        }

        const renderCategories = () => {
            categoryGrid.innerHTML = ''
            const categories =
                this.app.categoryManager.getAllCategories(currentType)
            categories.forEach(cat => {
                const btn = document.createElement('button')
                btn.className =
                    'category-button flex flex-col items-center gap-1 p-2 rounded-lg border-2 border-transparent'
                btn.dataset.categoryId = cat.id
                if (cat.id === selectedCategory) {
                    btn.classList.add(
                        currentType === 'income' ? 'active-income' : 'active'
                    )
                }

                const colorStyle = cat.color.startsWith('#')
                    ? `style="background-color: ${cat.color}"`
                    : ''
                const colorClass = !cat.color.startsWith('#') ? cat.color : ''

                btn.innerHTML = `
                    <div class="flex size-12 items-center justify-center rounded-full ${colorClass} text-white" ${colorStyle}>
                        <i class="${cat.icon} text-2xl"></i>
                    </div>
                    <p class="text-xs text-center text-wabi-text-secondary">${cat.name}</p>
                `
                btn.addEventListener('click', () => {
                    selectedCategory = cat.id
                    updateSelectedCategoryUI(cat)
                    document
                        .querySelectorAll('.category-button')
                        .forEach(b =>
                            b.classList.remove('active', 'active-income')
                        )
                    btn.classList.add(
                        currentType === 'income' ? 'active-income' : 'active'
                    )
                })
                categoryGrid.appendChild(btn)
            })
            const manageBtn = document.createElement('button')
            manageBtn.className =
                'flex flex-col items-center gap-1 p-2 rounded-lg border-2 border-dashed border-wabi-border hover:border-wabi-primary'
            manageBtn.innerHTML = `<div class="flex size-12 items-center justify-center rounded-full bg-wabi-text-secondary/10"><i class="fa-solid fa-gear text-2xl text-wabi-text-secondary"></i></div><p class="text-xs text-center text-wabi-text-secondary">管理</p>`
            manageBtn.addEventListener('click', () =>
                this.app.categoryManager.showManageCategoriesModal(
                    currentType,
                    renderCategories
                )
            )
            categoryGrid.appendChild(manageBtn)
        }

        const updateSelectedCategoryUI = category => {
            if (category) {
                const colorStyle = category.color.startsWith('#')
                    ? `style="background-color: ${category.color}"`
                    : ''
                const colorClass = !category.color.startsWith('#')
                    ? category.color
                    : ''
                selectedCategoryUI.innerHTML = `
                    <div class="flex items-center justify-center rounded-full ${colorClass} text-white shrink-0 size-12" ${colorStyle}>
                        <i class="${category.icon} text-3xl"></i>
                    </div>
                    <p class="text-lg font-medium flex-1 truncate">${category.name}</p>
                `
            } else {
                selectedCategoryUI.innerHTML = `<div class="flex items-center justify-center rounded-full bg-wabi-text-secondary/10 shrink-0 size-12"><i class="fa-solid fa-question text-3xl text-wabi-text-secondary"></i></div><p class="text-lg font-medium">選擇分類</p>`
            }
        }

        const saveRegularRecord = async amount => {
            const recordData = {
                type: currentType,
                category: selectedCategory,
                amount: amount,
                description: noteInput.value,
                date: currentDate,
            }

            if (isEditMode) {
                try {
                    const numericId = parseInt(recordId, 10)
                    await this.app.dataService.updateRecord(
                        numericId,
                        recordData
                    )
                    showToast('更新成功！')
                    window.location.hash = 'records'
                } catch (e) {
                    console.error('Update failed or cancelled:', e)
                }
            } else {
                const newRecordId =
                    await this.app.dataService.addRecord(recordData)
                if (!newRecordId) return
                this.app.quickSelectManager.addRecord(
                    recordData.type,
                    recordData.category,
                    recordData.description,
                    null
                )
                showToast('儲存成功！')
                window.location.hash = 'records'
            }
        }

        const handleKeypad = async key => {
            if (['+', '-', '×', '÷'].includes(key)) {
                if (currentAmount !== '0') {
                    if (calcPrev !== null && !calcNew) {
                        currentAmount = formatCalcResult(
                            calculate(calcPrev, calcOp, currentAmount)
                        )
                    }
                    calcPrev = currentAmount
                    calcOp = key
                    calcNew = true
                }
                updateSaveButtonUI()
                amountDisplay.textContent = formatCurrency(currentAmount)
                return
            }

            if ((key >= '0' && key <= '9') || key === '00') {
                if (calcNew && calcPrev !== null) {
                    currentAmount = key
                    calcNew = false
                } else if (currentAmount === '0') {
                    currentAmount = key === '00' ? '0' : key
                } else {
                    if (currentAmount.replace('.', '').length < 9)
                        currentAmount += key
                }
            } else if (key === '.') {
                if (calcNew && calcPrev !== null) {
                    currentAmount = '0.'
                    calcNew = false
                } else if (!currentAmount.includes('.')) currentAmount += '.'
            } else if (key === 'backspace') {
                currentAmount = currentAmount.slice(0, -1) || '0'
            } else if (key === 'ac') {
                currentAmount = '0'
                calcPrev = null
                calcOp = null
                calcNew = true
                updateSaveButtonUI()
            } else if (key === 'done') {
                toggleKeypadGrid(false)
            } else if (key === 'save') {
                if (calculatorModeEnabled && calcOp !== null) {
                    currentAmount = formatCalcResult(
                        calculate(calcPrev, calcOp, currentAmount)
                    )
                    calcPrev = null
                    calcOp = null
                    calcNew = true
                    updateSaveButtonUI()
                    amountDisplay.textContent = formatCurrency(currentAmount)
                    return
                }
                const amount = parseFloat(currentAmount)
                if (amount > 0 && selectedCategory) {
                    await saveRegularRecord(amount)
                } else {
                    showToast('請輸入金額並選擇分類', 'error')
                }
            }
            amountDisplay.textContent = formatCurrency(currentAmount)
        }

        if (isEditMode) {
            const numericRecordId = parseInt(recordId, 10)
            const records = await this.app.dataService.getRecords()
            recordToEdit = records.find(r => r.id === numericRecordId)
            if (recordToEdit) {
                currentType = recordToEdit.type
                currentAmount = String(recordToEdit.amount)
                selectedCategory = recordToEdit.category
                currentDate = recordToEdit.date
                noteInput.value = recordToEdit.description || ''
                amountDisplay.textContent = formatCurrency(currentAmount)
                dateDisplay.textContent = formatDate(currentDate, 'short')
                dateInput.value = currentDate
            }
        }

        const handleQuickSelect = (type, categoryId, description) => {
            if (isEditMode) return
            currentType = type
            selectedCategory = categoryId
            noteInput.value = description || ''
            updateTypeUI()
        }

        if (!isEditMode) {
            this.app.quickSelectManager.render(
                quickSelectContainer,
                handleQuickSelect,
                this.app.categoryManager,
                false
            )
        }

        keypadToggleBtn.addEventListener('click', () => toggleKeypadGrid())

        amountDisplay.style.cursor = 'pointer'
        amountDisplay.title = '點擊輸入金額'
        amountDisplay.addEventListener('click', () => toggleKeypadGrid(true))

        dateInput.addEventListener('change', e => {
            currentDate = e.target.value
            dateDisplay.textContent = formatDate(currentDate, 'short')
        })

        document.querySelectorAll('.keypad-btn').forEach(btn => {
            btn.addEventListener('click', () => handleKeypad(btn.dataset.key))
        })

        if (this._keypadListener) {
            document.removeEventListener('keydown', this._keypadListener)
        }
        this._keypadListener = e => {
            if (
                this.app.router.currentHash &&
                !this.app.router.currentHash.startsWith('#add')
            )
                return
            if (
                document.activeElement &&
                ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
            )
                return
            if (e.ctrlKey || e.altKey || e.metaKey) return

            const keyMap = {
                0: '0',
                1: '1',
                2: '2',
                3: '3',
                4: '4',
                5: '5',
                6: '6',
                7: '7',
                8: '8',
                9: '9',
                '.': '.',
                Backspace: 'backspace',
                Enter: 'save',
                Delete: 'ac',
                Escape: 'ac',
            }

            if (calculatorModeEnabled) {
                keyMap['+'] = '+'
                keyMap['-'] = '-'
                keyMap['*'] = '×'
                keyMap['/'] = '÷'
                keyMap['='] = 'save'
            }

            if (keyMap[e.key]) {
                e.preventDefault()
                handleKeypad(keyMap[e.key])
            }
        }
        document.addEventListener('keydown', this._keypadListener)

        expenseBtn.addEventListener('click', () => {
            if (!isEditMode) {
                if (currentType !== 'expense') {
                    currentType = 'expense'
                    const isExpenseCategory = this.app.categoryManager
                        ?.getAllCategories?.('expense', true)
                        ?.some(c => c.id === selectedCategory)
                    if (!isExpenseCategory) {
                        selectedCategory = getDefaultExpenseCategory()
                    }
                    updateTypeUI()
                }
            }
        })
        incomeBtn.addEventListener('click', () => {
            if (!isEditMode) {
                if (currentType !== 'income') {
                    currentType = 'income'
                    const isIncomeCategory = this.app.categoryManager
                        ?.getAllCategories?.('income', true)
                        ?.some(c => c.id === selectedCategory)
                    if (!isIncomeCategory) {
                        selectedCategory = null
                    }
                    updateTypeUI()
                }
            }
        })

        if (isEditMode) {
            const deleteBtn = document.getElementById('delete-record-btn')
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async () => {
                    if (await customConfirm('確定要刪除這筆紀錄嗎？')) {
                        const id = parseInt(recordId, 10)
                        await this.app.dataService.deleteRecord(id)
                        showToast('紀錄已刪除')
                        window.location.hash = 'records'
                    }
                })
            }
        }

        updateTypeUI()
        toggleKeypadGrid(true)
        updateSaveButtonUI()
    }

    createKeypadButton(key, isEditMode = false, calculatorModeEnabled = false) {
        let content = key
        if (key === 'ac') content = 'AC'
        if (key === 'backspace')
            content = '<i class="fa-solid fa-delete-left"></i>'
        if (key === 'save') {
            content = isEditMode
                ? '<span class="font-bold">更新</span>'
                : '<span class="font-bold">儲存</span>'
        }

        let specialClasses
        if (key === 'save') {
            specialClasses =
                'row-span-2 bg-wabi-accent text-wabi-primary flex items-center justify-center text-lg'
        } else if (
            calculatorModeEnabled &&
            ['+', '-', '×', '÷'].includes(key)
        ) {
            specialClasses = 'bg-amber-500/20 text-amber-600 font-medium'
        } else if (key === 'ac') {
            specialClasses = 'bg-wabi-border text-wabi-text-primary'
        } else if (key === 'backspace') {
            specialClasses = 'text-wabi-text-primary'
        } else if (key === '') {
            specialClasses = 'bg-transparent'
        } else {
            specialClasses = 'text-wabi-text-primary'
        }

        if (key === '') return `<div class="${specialClasses}"></div>`

        return `
            <button data-key="${key}" class="keypad-btn text-xl py-2 text-center rounded-none transition-colors touch-manipulation duration-200 ease-in-out ${specialClasses} hover:bg-black/5">
                ${content}
            </button>
        `
    }
}
