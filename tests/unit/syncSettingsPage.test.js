import { describe, it, expect, beforeEach } from 'vitest'
import { SyncSettingsPage } from '../../src/js/pages/syncSettingsPage.js'

describe('SyncSettingsPage Theme & Styling', () => {
    let mockApp
    let mockSyncService
    let mockDataService

    beforeEach(() => {
        document.body.innerHTML = '<div id="app-container"></div>'

        mockDataService = {
            getSetting: async (key) => null,
            saveSetting: async (obj) => {}
        }

        mockSyncService = {
            isSignedIn: () => false,
            userInfo: null,
            getServerUrl: () => 'https://easy-accounting-sync.workers.cloudflare.henry-yo.top',
            deviceId: 'test-device-123'
        }

        mockApp = {
            appContainer: document.getElementById('app-container'),
            dataService: mockDataService,
            syncService: mockSyncService
        }
    })

    it('未登入時，登入按鈕應使用主題背景與主題文字變數，且無未適配的寫死顏色', async () => {
        const page = new SyncSettingsPage(mockApp)
        await page.render()

        const signInBtn = document.getElementById('sync-sign-in-btn')
        expect(signInBtn).not.toBeNull()
        expect(signInBtn.className).toContain('bg-wabi-bg')
        expect(signInBtn.className).toContain('text-wabi-text-primary')
        expect(signInBtn.className).not.toContain('bg-green-50')
        expect(signInBtn.innerHTML).toContain('text-wabi-text-primary')
        expect(signInBtn.innerHTML).not.toContain('text-gray-700')
    })

    it('已登入時，帳號名稱外框應使用 bg-wabi-bg 與主題邊框，無寫死之 bg-green-50', async () => {
        mockSyncService.isSignedIn = () => true
        mockSyncService.userInfo = {
            name: '測試使用者',
            email: 'test@example.com',
            picture: 'https://example.com/avatar.png'
        }

        const page = new SyncSettingsPage(mockApp)
        await page.render()

        const containerHtml = mockApp.appContainer.innerHTML

        // 檢查不含寫死綠色背景與文字
        expect(containerHtml).not.toContain('bg-green-50')
        expect(containerHtml).not.toContain('border-green-200')
        expect(containerHtml).not.toContain('bg-green-100')
        expect(containerHtml).not.toMatch(/\bhover:bg-red-50\b/)

        // 檢查已套用主題變數
        expect(containerHtml).toContain('bg-wabi-bg rounded-lg border border-wabi-border')
        expect(containerHtml).toContain('text-wabi-income')
        expect(containerHtml).toContain('測試使用者')
        expect(containerHtml).toContain('test@example.com')
    })

    it('未登入時應有帳號名稱與密碼輸入框，並支援登入與註冊切換', async () => {
        const page = new SyncSettingsPage(mockApp)
        await page.render()

        expect(document.getElementById('sync-username-input')).not.toBeNull()
        expect(document.getElementById('sync-password-input')).not.toBeNull()
        expect(document.getElementById('sync-confirm-password-input')).toBeNull()

        const tabRegister = document.getElementById('sync-tab-register')
        expect(tabRegister).not.toBeNull()
        tabRegister.click()
        await page.render()

        expect(document.getElementById('sync-confirm-password-input')).not.toBeNull()
        const signInBtn = document.getElementById('sync-sign-in-btn')
        expect(signInBtn.textContent).toContain('建立帳號並登入')
    })
    it('伺服器設定應使用 details 摺疊顯示在頁面最下方', async () => {
        const page = new SyncSettingsPage(mockApp)
        await page.render()

        const detailsEl = document.getElementById('sync-server-settings-details')
        expect(detailsEl).not.toBeNull()
        expect(detailsEl.tagName.toLowerCase()).toBe('details')

        // 伺服器設定容器應為最底部的子元素
        const parentContainer = detailsEl.parentElement
        const children = Array.from(parentContainer.children)
        expect(children[children.length - 1]).toBe(detailsEl)

        const summaryText = detailsEl.querySelector('summary').textContent
        expect(summaryText).toContain('伺服器設定')
        expect(summaryText).toContain('easy-accounting-sync.workers.cloudflare.henry-yo.top')
    })

    it('全量備份卡片應正確呈現已備份大小與筆數統計', async () => {
        mockSyncService.isSignedIn = () => true
        mockSyncService.userInfo = { name: 'User' }
        mockDataService.getSetting = async (key) => {
            if (key === 'sync_last_backup') {
                return {
                    value: {
                        timestamp: 1730000000000,
                        sizeBytes: 1048576 * 1.5, // 1.5 MB
                        recordsCount: 350,
                        totalItems: 420,
                    }
                }
            }
            return null
        }

        const page = new SyncSettingsPage(mockApp)
        await page.render()

        const containerHtml = mockApp.appContainer.innerHTML
        expect(containerHtml).toContain('全量備份')
        expect(containerHtml).toContain('已備份容量 / 筆數')
        expect(containerHtml).toContain('1.5 MB')
        expect(containerHtml).toContain('350 筆明細')
        expect(containerHtml).toContain('共 420 筆資料')
    })

    it('重設伺服器 URL 按鈕應還原為預設 Cloudflare Workers 伺服器網址', async () => {
        let savedUrl = ''
        mockSyncService.setServerUrl = async (url) => {
            savedUrl = url
        }
        mockSyncService.getDefaultServerUrl = () => 'https://easy-accounting-sync.workers.cloudflare.henry-yo.top'

        const page = new SyncSettingsPage(mockApp)
        await page.render()

        const resetBtn = document.getElementById('sync-server-reset-btn')
        expect(resetBtn).not.toBeNull()

        resetBtn.click()

        expect(savedUrl).toBe('https://easy-accounting-sync.workers.cloudflare.henry-yo.top')
    })

    it('點擊刪除備份時，確認後應呼叫 deleteBackup 並立即從 DOM 列表中移除該項目', async () => {
        mockSyncService.isSignedIn = () => true
        mockSyncService.userInfo = { name: 'User' }
        mockSyncService.listBackups = async () => [
            { id: '101', name: 'backup_1.json', size: 1024, createdTime: '2026-11-01T00:00:00Z' },
            { id: '102', name: 'backup_2.json', size: 2048, createdTime: '2026-11-02T00:00:00Z' }
        ]
        const deletedIds = []
        mockSyncService.deleteBackup = async (id) => {
            deletedIds.push(id)
            return true
        }

        const page = new SyncSettingsPage(mockApp)
        await page.render()

        const restoreBtn = document.getElementById('sync-restore-btn')
        expect(restoreBtn).not.toBeNull()
        await restoreBtn.click()

        const rowsBefore = document.querySelectorAll('.backup-item-row')
        expect(rowsBefore.length).toBe(2)

        // 點擊第一筆備份的刪除按鈕
        const deleteBtn = rowsBefore[0].querySelector('.delete-backup-item')
        deleteBtn.click()

        // customConfirm 會在 body 產生 confirm modal
        const confirmOkBtn = document.querySelector('.custom-confirm-ok')
        expect(confirmOkBtn).not.toBeNull()
        confirmOkBtn.click()

        // 等待非同步 deleteBackup 與 DOM 移除
        await new Promise(r => setTimeout(r, 250))

        expect(deletedIds).toEqual(['101'])
        const rowsAfter = document.querySelectorAll('.backup-item-row')
        expect(rowsAfter.length).toBe(1)
        expect(rowsAfter[0].dataset.fileId).toBe('102')
    })
})