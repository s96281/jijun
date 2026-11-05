// ==================== E2E Test Setup (Vitest + JSDOM) ====================
import { vi, beforeEach, afterEach } from 'vitest'

// ── In-Memory IndexedDB Mock (Schema v15 Compatible) ────────────────────
let nextId = 100

export const mockDb = {
    _storeData: {},

    initStore(name) {
        if (!this._storeData[name]) {
            this._storeData[name] = []
        }
        return this._storeData[name]
    },

    initSharedStore(storeName) {
        if (!this._sharedStores) {
            this._sharedStores = {}
        }
        if (!this._sharedStores[storeName]) {
            const data = this.initStore(storeName)
            this._sharedStores[storeName] = {
                indexNames: {
                    contains: name => {
                        const indexes = {
                            records: ['date', 'amortizationId', 'uuid', 'ledgerId'],
                            accounts: ['type', 'uuid', 'ledgerId'],
                            contacts: ['uuid', 'ledgerId'],
                            debts: ['uuid', 'ledgerId'],
                            recurring_transactions: ['uuid', 'ledgerId'],
                            ledgers: ['uuid'],
                            credit_statements: [
                                'accountId',
                                'ledgerId',
                                'period',
                                'status',
                            ],
                            amortizations: ['uuid', 'ledgerId', 'status'],
                            groupMeta: ['ledgerId'],
                        }
                        return (indexes[storeName] || []).includes(name)
                    },
                },
                index: name => ({
                    get: async key => {
                        const item = data.find(i => i[name] === key)
                        return Promise.resolve(item || null)
                    },
                    getAll: async query => {
                        let filterFn
                        if (
                            query &&
                            typeof query === 'object' &&
                            (query.lower !== undefined || query.upper !== undefined)
                        ) {
                            filterFn = item => {
                                const val = item[name]
                                if (query.lower !== undefined && query.upper !== undefined) {
                                    return val >= query.lower && val <= query.upper
                                } else if (query.lower !== undefined) {
                                    return val >= query.lower
                                } else {
                                    return val <= query.upper
                                }
                            }
                        } else {
                            filterFn = item => item[name] === query
                        }
                        return Promise.resolve(data.filter(filterFn))
                    },
                    openCursor: async keyRange => {
                        let filterFn
                        if (
                            keyRange &&
                            typeof keyRange === 'object' &&
                            (keyRange.lower !== undefined || keyRange.upper !== undefined)
                        ) {
                            filterFn = item => {
                                const val = item[name]
                                if (keyRange.lower !== undefined && keyRange.upper !== undefined) {
                                    return val >= keyRange.lower && val <= keyRange.upper
                                } else if (keyRange.lower !== undefined) {
                                    return val >= keyRange.lower
                                } else {
                                    return val <= keyRange.upper
                                }
                            }
                        } else if (keyRange && keyRange._only !== undefined) {
                            filterFn = item => item[name] === keyRange._only
                        } else {
                            filterFn = item => item[name] === keyRange
                        }

                        const filtered = data.filter(filterFn)
                        let cursorIdx = 0

                        const getCursor = () => {
                            if (cursorIdx >= filtered.length) return null
                            const item = filtered[cursorIdx]
                            return {
                                value: item,
                                delete: async () => {
                                    const idx = data.findIndex(i => i.id === item.id)
                                    if (idx >= 0) data.splice(idx, 1)
                                    return Promise.resolve()
                                },
                                continue: async () => {
                                    cursorIdx++
                                    return Promise.resolve(getCursor())
                                },
                            }
                        }
                        return Promise.resolve(getCursor())
                    },
                }),
                add: itemData => {
                    const id = nextId++
                    data.push({ ...itemData, id })
                    return Promise.resolve(id)
                },
                put: itemData => {
                    const idx = data.findIndex(
                        item =>
                            (itemData.id !== undefined && item.id === itemData.id) ||
                            (itemData.key !== undefined && item.key === itemData.key)
                    )
                    if (idx >= 0) {
                        data[idx] = { ...itemData }
                    } else {
                        data.push({ ...itemData })
                    }
                    return Promise.resolve()
                },
                get: id => {
                    const item = data.find(i => i.id === id || i.key === id)
                    return Promise.resolve(item || null)
                },
                openCursor: () => {
                    let cursorIdx = 0
                    const getCursor = () => {
                        if (cursorIdx >= data.length) return null
                        const item = data[cursorIdx]
                        return {
                            key: item.id || item.key,
                            value: item,
                            delete: async () => {
                                const idx = data.indexOf(item)
                                if (idx >= 0) data.splice(idx, 1)
                                return Promise.resolve()
                            },
                            continue: async () => {
                                cursorIdx++
                                return Promise.resolve(getCursor())
                            },
                        }
                    }
                    return Promise.resolve(getCursor())
                },
                getAll: () => Promise.resolve([...data]),
                delete: id => {
                    const idx = data.findIndex(i => i.id === id || i.key === id)
                    if (idx >= 0) data.splice(idx, 1)
                    return Promise.resolve()
                },
                clear: () => {
                    data.length = 0
                    return Promise.resolve()
                },
                count: () => Promise.resolve(data.length),
                toArray: () => Promise.resolve([...data]),
            }
        }
        return this._sharedStores[storeName]
    },

    async get(keyPath, key) {
        const storeName = typeof keyPath === 'string' ? keyPath : 'records'
        const data = this.initStore(storeName)
        return Promise.resolve(data.find(item => item.id === key || item.key === key) || null)
    },

    async getAll(storeName) {
        const data = this.initStore(storeName)
        return Promise.resolve([...data])
    },

    async getAllFromIndex(storeName, indexName, query) {
        const data = this.initStore(storeName)
        return Promise.resolve(data.filter(item => item[indexName] === query))
    },

    transaction(stores, mode) {
        const storeNames = typeof stores === 'string' ? [stores] : stores
        const objectStores = {}
        for (const name of storeNames) {
            objectStores[name] = this.initSharedStore(name)
        }

        return {
            store: objectStores[storeNames[0]],
            objectStore(name) {
                return objectStores[name] || mockDb.initSharedStore(name)
            },
            done: Promise.resolve(),
            onerror: null,
            onabort: null,
            oncomplete: null,
        }
    },
}

// Initialize all Schema v15 stores
const ALL_STORES = [
    'settings',
    'ledgers',
    'records',
    'accounts',
    'contacts',
    'debts',
    'recurring_transactions',
    'amortizations',
    'plugins',
    'credit_statements',
    'groupMeta',
    'files',
    'themes',
    'sync_log',
]
for (const name of ALL_STORES) {
    mockDb.initStore(name)
}

// ── Global Environment Setup ──────────────────────────────────────────
globalThis.window = globalThis

// IndexedDB Factory Mock
globalThis.indexedDB = {
    open: () => ({ onupgradeneeded: null, onsuccess: null, onerror: null }),
    databases: () => Promise.resolve([{ name: 'EasyAccountingDB', version: 15 }]),
    _storeData: mockDb._storeData,
}

globalThis.idb = { openDB: () => Promise.resolve(mockDb) }
vi.mock('idb', () => ({
    openDB: () => Promise.resolve(mockDb),
}))

globalThis.IDBKeyRange = {
    only: value => ({ _only: value }),
    bound: (lower, upper) => ({ lower, upper }),
    lowerBound: lower => ({ lower }),
    upperBound: upper => ({ upper }),
}
globalThis.Capacitor = {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
}

// Mock matchMedia for themeManager
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

// Mock Canvas 2D context for Chart.js in JSDOM
if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        getImageData: vi.fn(() => ({ data: new Array(4) })),
        putImageData: vi.fn(),
        createImageData: vi.fn(() => []),
        setTransform: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        fillText: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        stroke: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        rotate: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        measureText: vi.fn(() => ({ width: 0 })),
        transform: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
    })
}

// Global fetch mock to safely handle local assets
const originalFetch = globalThis.fetch
globalThis.fetch = vi.fn().mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    if (url.includes('themes/dark.json') || url.includes('dark.json')) {
        return {
            ok: true,
            status: 200,
            json: async () => ({
                id: 'builtin.dark',
                name: '深色模式',
                colors: {
                    'wabi-bg': '#1e2022',
                    'wabi-surface': '#26282b',
                    'wabi-primary': '#e2e8f0',
                },
            }),
        }
    }
    if (url.includes('internal-ads.json')) {
        // Return 404 once deleted, or 200 if file exists
        return {
            ok: false,
            status: 404,
            json: async () => [],
        }
    }
    if (originalFetch) {
        try {
            return await originalFetch(input, init)
        } catch (_) {
            return { ok: false, status: 500, json: async () => ({}) }
        }
    }
    return { ok: false, status: 404, json: async () => ({}) }
})

// Setup full standard DOM template matching index.html
export function setupTestDOM() {
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
}

beforeEach(() => {
    // Reset stores
    for (const name of Object.keys(mockDb._storeData)) {
        mockDb._storeData[name].length = 0
    }
    mockDb._sharedStores = {}
    nextId = 100

    // Seed default ledger #1
    mockDb.initStore('ledgers').push({
        id: 1,
        uuid: 'default-ledger-uuid-1',
        name: '預設帳本',
        icon: 'fa-solid fa-book',
        color: '#334A52',
        type: 'personal',
        createdAt: Date.now(),
    })

    // Reset localStorage
    localStorage.clear()
    localStorage.setItem('activeLedgerId', '1')

    // Reset DOM
    setupTestDOM()
    window.location.hash = ''

    vi.clearAllMocks()
})

afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

export function createMockApp(dataService, overrides = {}) {
    return {
        appContainer: document.getElementById('app-container'),
        dataService,
        categoryManager: overrides.categoryManager || null,
        ledgerManager: overrides.ledgerManager || {
            getActiveLedger: () => ({ id: 1, name: '預設帳本', type: 'personal' }),
            getAllLedgers: () => [{ id: 1, name: '預設帳本', type: 'personal' }],
            init: vi.fn().mockResolvedValue(),
        },
        themeManager: overrides.themeManager || {
            themeMode: 'system',
            setThemeMode: vi.fn(),
            init: vi.fn().mockResolvedValue(),
            destroy: vi.fn(),
        },
        budgetManager: { renderBudgetWidget: vi.fn().mockResolvedValue(''), loadBudget: vi.fn().mockResolvedValue() },
        changelogManager: { getAllVersions: () => [{ version: '2.1.8.5' }] },
        aiService: {
            getQuantization: () => 'q4_k_m',
            hasModelUpdate: () => false,
            isModelDownloaded: () => false,
            checkForModelUpdate: () => Promise.resolve({ hasUpdate: false }),
            isExperimentalEnabled: () => false,
            init: vi.fn().mockResolvedValue(),
        },
        updateSidebarLedger: vi.fn(),
        router: { handleRouteChange: vi.fn() },
        rewardService: undefined,
        ...overrides,
    }
}

