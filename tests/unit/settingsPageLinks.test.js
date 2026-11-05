import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    SettingsPage,
    isVersionNewer,
} from '../../src/js/pages/settingsPage.js'
import fs from 'fs'
import path from 'path'

describe('SettingsPage & Global Links - R2 專案倉庫與更新連結重新導向', () => {
    let mockApp, container, fetchSpy

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'app-container'
        document.body.innerHTML = ''
        document.body.appendChild(container)

        // Mock fetch for GitHub API
        fetchSpy = vi
            .spyOn(globalThis, 'fetch')
            .mockImplementation(async url => {
                if (url === 'https://api.github.com/repos/s96281/jijun') {
                    return {
                        ok: true,
                        json: async () => ({ stargazers_count: 42 }),
                    }
                }
                return {
                    ok: false,
                    json: async () => ({}),
                }
            })

        // Mock App environment for SettingsPage
        mockApp = {
            appContainer: container,
            dataService: {
                getSetting: vi.fn().mockImplementation(async key => {
                    if (key === 'advancedAccountModeEnabled')
                        return { value: false }
                    if (key === 'calculatorModeEnabled') return { value: true }
                    return null
                }),
                saveSetting: vi.fn().mockResolvedValue(true),
                getAccounts: vi.fn().mockResolvedValue([]),
                getLedgers: vi.fn().mockResolvedValue([]),
            },
            themeManager: {
                themeMode: 'system',
                setThemeMode: vi.fn().mockResolvedValue(),
                activeTheme: { id: 'default', name: '預設' },
            },
            ledgerManager: {
                getActiveLedger: vi
                    .fn()
                    .mockReturnValue({ id: 1, name: '預設帳本' }),
            },
            syncService: {
                isConfigured: vi.fn().mockReturnValue(false),
            },
            changelogManager: {
                getAllVersions: () => [{ version: '2.1.8.5' }],
                showChangelogModal: vi.fn(),
            },
            guideManager: {
                resetAllGuides: vi.fn(),
                showWelcomeModal: vi.fn(),
                showToggleTour: vi.fn(),
                startTour: vi.fn(),
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
                checkForModelUpdate: () =>
                    Promise.resolve({ hasUpdate: false }),
                isExperimentalEnabled: () => false,
                init: vi.fn().mockResolvedValue(),
            },
        }
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('設定頁面中的 GitHub 儲存庫超連結指向 https://github.com/s96281/jijun', async () => {
        const page = new SettingsPage(mockApp)
        await page.render()

        const repoLink = document.getElementById('github-repo-link')
        expect(repoLink).not.toBeNull()
        expect(repoLink.getAttribute('href')).toBe(
            'https://github.com/s96281/jijun'
        )
        expect(repoLink.getAttribute('href')).not.toContain('ADT109119')
    })

    it('設定頁面中查詢 GitHub Star 數量的 API 請求網址為 https://api.github.com/repos/s96281/jijun 且更新 DOM', async () => {
        const page = new SettingsPage(mockApp)
        await page.render()

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.github.com/repos/s96281/jijun'
        )
        expect(fetchSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('ADT109119')
        )

        // 等候 Promise microtask 完成
        await new Promise(resolve => setTimeout(resolve, 10))

        const starCount = document.getElementById('star-count')
        expect(starCount).not.toBeNull()
        expect(starCount.textContent).toBe('42')
    })

    it('合約掃描：確認 src/ 目錄下所有代碼檔案中完全無殘留 ADT109119/jijun 引用', () => {
        const srcDir = path.resolve(__dirname, '../../src')

        function scanDir(dir) {
            const files = fs.readdirSync(dir, { withFileTypes: true })
            const matches = []

            for (const file of files) {
                const fullPath = path.join(dir, file.name)
                if (file.isDirectory()) {
                    matches.push(...scanDir(fullPath))
                } else if (
                    file.isFile() &&
                    (file.name.endsWith('.js') ||
                        file.name.endsWith('.html') ||
                        file.name.endsWith('.css'))
                ) {
                    const content = fs.readFileSync(fullPath, 'utf8')
                    if (content.includes('ADT109119/jijun')) {
                        matches.push({ file: fullPath })
                    }
                }
            }
            return matches
        }

        const violations = scanDir(srcDir)
        expect(violations).toEqual([])
    })
})

describe('GitHub Release 版本比較', () => {
    it('正確辨識 GitHub Release 的較新四段式版本', () => {
        expect(isVersionNewer('v2.1.8.13', '2.1.8.12')).toBe(true)
        expect(isVersionNewer('v2.1.8.10', '2.1.8.11')).toBe(false)
        expect(isVersionNewer('v2.1.8.11', '2.1.8.11')).toBe(false)
    })

    it('忽略格式不正確的 Release tag', () => {
        expect(isVersionNewer('latest', '2.1.8.11')).toBe(false)
    })
})
