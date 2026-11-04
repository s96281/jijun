// ==================== AppUpdateService 單元測試 ====================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    AppUpdateService,
    selectApkAsset,
    formatBytes,
    GITHUB_LATEST_RELEASE_URL,
} from '../../src/js/appUpdateService.js'

describe('AppUpdateService 工具函式', () => {
    describe('selectApkAsset', () => {
        const mockAssets = [
            {
                name: 'easy-accounting-web.zip',
                browser_download_url: 'https://example.com/web.zip',
            },
            {
                name: 'easy-accounting-app-universal-release.apk',
                browser_download_url: 'https://example.com/universal.apk',
            },
            {
                name: 'easy-accounting-app-universal-release.apk.idsig',
                browser_download_url: 'https://example.com/universal.apk.idsig',
            },
            {
                name: 'easy-accounting-app-arm64-v8a-release.apk',
                browser_download_url: 'https://example.com/arm64.apk',
            },
            {
                name: 'easy-accounting-app-armeabi-v7a-release.apk',
                browser_download_url: 'https://example.com/arm32.apk',
            },
        ]

        it('當 assets 為空或無 APK 時回傳 null', () => {
            expect(selectApkAsset([])).toBeNull()
            expect(selectApkAsset(null)).toBeNull()
            expect(
                selectApkAsset([{ name: 'test.zip', browser_download_url: '...' }])
            ).toBeNull()
        })

        it('優先選擇裝置偏好架構 (如 arm64-v8a)', () => {
            const selected = selectApkAsset(mockAssets, ['arm64-v8a', 'armeabi-v7a'])
            expect(selected).not.toBeNull()
            expect(selected.name).toBe('easy-accounting-app-arm64-v8a-release.apk')
            expect(selected.browser_download_url).toBe('https://example.com/arm64.apk')
        })

        it('次選裝置第二偏好架構 (如 armeabi-v7a)', () => {
            const assetsWithoutArm64 = mockAssets.filter(
                a => !a.name.includes('arm64')
            )
            const selected = selectApkAsset(assetsWithoutArm64, [
                'arm64-v8a',
                'armeabi-v7a',
            ])
            expect(selected.name).toBe('easy-accounting-app-armeabi-v7a-release.apk')
        })

        it('無符合之專屬架構時回退至 universal 通用 APK', () => {
            const selected = selectApkAsset(mockAssets, ['x86_64', 'x86'])
            expect(selected.name).toBe('easy-accounting-app-universal-release.apk')
        })

        it('若 universal 亦不存在，回退至清單中第一個 APK', () => {
            const fallbackAssets = [
                { name: 'custom-build.apk', browser_download_url: 'https://example.com/custom.apk' },
            ]
            const selected = selectApkAsset(fallbackAssets, ['arm64-v8a'])
            expect(selected.name).toBe('custom-build.apk')
        })
    })

    describe('formatBytes', () => {
        it('格式化 0 或無效數值為 0 B', () => {
            expect(formatBytes(0)).toBe('0 B')
            expect(formatBytes(-100)).toBe('0 B')
            expect(formatBytes(null)).toBe('0 B')
        })

        it('格式化各種單位數值', () => {
            expect(formatBytes(500)).toBe('500 B')
            expect(formatBytes(1024)).toBe('1.0 KB')
            expect(formatBytes(1536)).toBe('1.5 KB')
            expect(formatBytes(1048576 * 12.4)).toBe('12.4 MB')
            expect(formatBytes(1073741824 * 2.5)).toBe('2.5 GB')
        })
    })
})

describe('AppUpdateService 核心服務', () => {
    let service
    let mockApp

    beforeEach(() => {
        vi.restoreAllMocks()
        sessionStorage.clear()
        document.body.innerHTML = ''

        mockApp = {
            dataService: {},
        }
        service = new AppUpdateService(mockApp)
    })

    afterEach(() => {
        service.closeActiveModal()
        document.body.innerHTML = ''
    })

    it('isAndroidNative 依 window.Capacitor 正確判斷環境', () => {
        window.Capacitor = undefined
        expect(service.isAndroidNative()).toBe(false)

        window.Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => 'web',
        }
        expect(service.isAndroidNative()).toBe(false)

        window.Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => 'android',
        }
        expect(service.isAndroidNative()).toBe(true)
    })

    it('checkOnStartup 在非 Android 環境下直接返回且不發送網路請求', async () => {
        window.Capacitor = undefined
        const fetchSpy = vi.spyOn(global, 'fetch')

        await service.checkOnStartup()
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('checkOnStartup 在 Android 環境下若發生網路錯誤靜默捕獲不拋出', async () => {
        window.Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => 'android',
        }
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network offline'))

        await expect(service.checkOnStartup()).resolves.not.toThrow()
    })

    it('checkForUpdates 比對無新版本時不彈窗並返回 hasUpdate: false', async () => {
        global.__APP_VERSION__ = '2.1.8.13'
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                tag_name: 'v2.1.8.13',
                body: 'Release notes',
                assets: [],
            }),
        })

        const result = await service.checkForUpdates({ isManual: false })
        expect(result.hasUpdate).toBe(false)
        expect(document.getElementById('app-update-prompt-modal')).toBeNull()
    })

    it('checkForUpdates 發現新版本時彈出通知 Modal', async () => {
        global.__APP_VERSION__ = '2.1.8.13'
        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                tag_name: 'v2.1.8.14',
                body: '## 新功能\n- 支援自動更新與下載',
                assets: [
                    {
                        name: 'easy-accounting-app-universal-release.apk',
                        browser_download_url: 'https://example.com/app.apk',
                    },
                ],
            }),
        })

        const result = await service.checkForUpdates({ isManual: false })
        expect(result.hasUpdate).toBe(true)

        const modal = document.getElementById('app-update-prompt-modal')
        expect(modal).not.toBeNull()
        expect(modal.textContent).toContain('發現新版本！')
        expect(modal.textContent).toContain('v2.1.8.13')
        expect(modal.textContent).toContain('v2.1.8.14')
        expect(modal.textContent).toContain('支援自動更新與下載')
    })

    it('啟動檢查時若該版本已被稍後提醒，不重複顯示彈窗', async () => {
        global.__APP_VERSION__ = '2.1.8.13'
        sessionStorage.setItem('dismissed_update_2.1.8.14', 'true')

        vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({
                tag_name: 'v2.1.8.14',
                body: 'Update',
                assets: [],
            }),
        })

        const result = await service.checkForUpdates({ isStartup: true })
        expect(result.hasUpdate).toBe(true)
        expect(result.dismissed).toBe(true)
        expect(document.getElementById('app-update-prompt-modal')).toBeNull()
    })

    it('點擊「稍後提醒」按鈕會關閉 Modal 並記錄於 sessionStorage', async () => {
        const release = {
            tag_name: 'v2.1.8.14',
            body: 'Changelog',
            assets: [],
        }
        service.showUpdatePromptModal(release, '2.1.8.13')

        const modal = document.getElementById('app-update-prompt-modal')
        expect(modal).not.toBeNull()

        const laterBtn = modal.querySelector('#update-later-btn')
        laterBtn.click()

        expect(document.getElementById('app-update-prompt-modal')).toBeNull()
        expect(sessionStorage.getItem('dismissed_update_2.1.8.14')).toBe('true')
    })

    it('在非原生環境下點擊「立即更新」導向瀏覽器下載', async () => {
        window.Capacitor = undefined
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {})

        const release = {
            tag_name: 'v2.1.8.14',
            html_url: 'https://github.com/release/v2.1.8.14',
            assets: [
                {
                    name: 'easy-accounting-app-universal-release.apk',
                    browser_download_url: 'https://example.com/download.apk',
                },
            ],
        }

        service.showUpdatePromptModal(release, '2.1.8.13')
        const confirmBtn = document.querySelector('#update-confirm-btn')
        await confirmBtn.click()

        expect(openSpy).toHaveBeenCalledWith('https://example.com/download.apk', '_blank')
        expect(document.getElementById('app-update-prompt-modal')).toBeNull()
    })

    it('showDownloadProgressModal 正確渲染進度條與取消按鈕', async () => {
        const mockPlugin = {
            cancelDownload: vi.fn().mockResolvedValue(),
            addListener: vi.fn().mockReturnValue(Promise.resolve({ remove: vi.fn() })),
            downloadAndInstall: vi.fn().mockReturnValue(new Promise(() => {})), // 保持 pending
        }

        service.showDownloadProgressModal(
            '2.1.8.14',
            'https://example.com/app.apk',
            mockPlugin
        )

        const progressModal = document.getElementById('app-update-progress-modal')
        expect(progressModal).not.toBeNull()
        expect(progressModal.textContent).toContain('正在下載更新...')
        expect(progressModal.textContent).toContain('v2.1.8.14')

        // 點擊取消按鈕
        const cancelBtn = progressModal.querySelector('#cancel-download-btn')
        cancelBtn.click()
        await new Promise(r => setTimeout(r, 20))

        expect(mockPlugin.cancelDownload).toHaveBeenCalled()
        expect(document.getElementById('app-update-progress-modal')).toBeNull()
    })
})
