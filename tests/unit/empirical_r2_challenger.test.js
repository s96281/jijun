import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SettingsPage } from '../../src/js/pages/settingsPage.js'
import fs from 'fs'
import path from 'path'

describe('Empirical Challenger Suite: Requirement 2 (Global Repository & API Redirection)', () => {
    let mockApp, container, fetchSpy

    beforeEach(() => {
        container = document.createElement('div')
        container.id = 'app-container'
        document.body.innerHTML = ''
        document.body.appendChild(container)

        // Default mock fetch
        fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => {
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

        mockApp = {
            appContainer: container,
            dataService: {
                getSetting: vi.fn().mockImplementation(async key => {
                    if (key === 'advancedAccountModeEnabled') return { value: false }
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
                getActiveLedger: vi.fn().mockReturnValue({ id: 1, name: '預設帳本' }),
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
            pluginManager: {
                renderHomeWidgets: vi.fn(),
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
        }
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    // -------------------------------------------------------------
    // Challenge 1: GitHub Repository link strictly equals s96281/jijun
    // -------------------------------------------------------------
    it('Challenge 1: Mount SettingsPage -> #github-repo-link href strictly equals https://github.com/s96281/jijun and has no ADT109119', async () => {
        const page = new SettingsPage(mockApp)
        await page.render()

        const repoLink = document.getElementById('github-repo-link')
        expect(repoLink).not.toBeNull()

        const href = repoLink.getAttribute('href')
        expect(href).toBe('https://github.com/s96281/jijun')
        expect(href).not.toContain('ADT109119')

        // Security check: target="_blank" should have rel="noopener noreferrer"
        expect(repoLink.getAttribute('target')).toBe('_blank')
        const rel = repoLink.getAttribute('rel') || ''
        expect(rel).toContain('noopener')
        expect(rel).toContain('noreferrer')
    })

    // -------------------------------------------------------------
    // Challenge 2: Mock fetch -> verify exact GitHub API endpoint URL
    // -------------------------------------------------------------
    it('Challenge 2: Mount SettingsPage -> fetch called with exactly https://api.github.com/repos/s96281/jijun', async () => {
        const page = new SettingsPage(mockApp)
        await page.render()

        expect(fetchSpy).toHaveBeenCalled()
        expect(fetchSpy).toHaveBeenCalledWith('https://api.github.com/repos/s96281/jijun')

        // Assert fetch was never called with any legacy ADT109119 URL
        const calls = fetchSpy.mock.calls
        for (const [url] of calls) {
            expect(url).not.toContain('ADT109119')
        }
    })

    // -------------------------------------------------------------
    // Challenge 3: API success responses update #star-count text
    // -------------------------------------------------------------
    it('Challenge 3a: API success response { stargazers_count: 42 } -> updates #star-count text to "42"', async () => {
        fetchSpy.mockImplementation(async url => {
            if (url === 'https://api.github.com/repos/s96281/jijun') {
                return {
                    ok: true,
                    json: async () => ({ stargazers_count: 42 }),
                }
            }
            return { ok: false, json: async () => ({}) }
        })

        const page = new SettingsPage(mockApp)
        await page.render()

        // Wait for microtask queue flush
        await new Promise(resolve => setTimeout(resolve, 20))

        const starCount = document.getElementById('star-count')
        expect(starCount).not.toBeNull()
        expect(starCount.textContent).toBe('42')
    })

    it('Challenge 3b: Boundary cases for star counts: 0 stars, large counts, and empty response', async () => {
        // Test 0 stars
        fetchSpy.mockImplementation(async () => ({
            ok: true,
            json: async () => ({ stargazers_count: 0 }),
        }))

        let page = new SettingsPage(mockApp)
        await page.render()
        await new Promise(resolve => setTimeout(resolve, 20))
        let starCount = document.getElementById('star-count')
        expect(starCount.textContent).toBe('0')

        // Test large star count
        fetchSpy.mockImplementation(async () => ({
            ok: true,
            json: async () => ({ stargazers_count: 12345 }),
        }))
        page = new SettingsPage(mockApp)
        await page.render()
        await new Promise(resolve => setTimeout(resolve, 20))
        starCount = document.getElementById('star-count')
        expect(starCount.textContent).toBe('12345')

        // Test missing stargazers_count key
        fetchSpy.mockImplementation(async () => ({
            ok: true,
            json: async () => ({}),
        }))
        page = new SettingsPage(mockApp)
        await page.render()
        await new Promise(resolve => setTimeout(resolve, 20))
        starCount = document.getElementById('star-count')
        expect(starCount.textContent).toBe('0')
    })

    // -------------------------------------------------------------
    // Challenge 4: API error & network rejection degrade gracefully
    // -------------------------------------------------------------
    it('Challenge 4a: Network rejection (fetch throws Error) -> graceful failure, star-count text cleared', async () => {
        fetchSpy.mockRejectedValue(new Error('DNS_PROBE_FINISHED_NXDOMAIN / Network down'))

        const page = new SettingsPage(mockApp)
        // Should not throw unhandled rejection
        await expect(page.render()).resolves.not.toThrow()

        await new Promise(resolve => setTimeout(resolve, 20))

        const starCount = document.getElementById('star-count')
        expect(starCount).not.toBeNull()
        // Graceful error handler sets textContent = ''
        expect(starCount.textContent).toBe('')
    })

    it('Challenge 4b: HTTP 403 / 500 error where json() rejects -> graceful failure, star-count cleared', async () => {
        fetchSpy.mockResolvedValue({
            ok: false,
            status: 403,
            json: async () => {
                throw new Error('Unexpected token < in JSON at position 0')
            },
        })

        const page = new SettingsPage(mockApp)
        await expect(page.render()).resolves.not.toThrow()

        await new Promise(resolve => setTimeout(resolve, 20))

        const starCount = document.getElementById('star-count')
        expect(starCount).not.toBeNull()
        expect(starCount.textContent).toBe('')
    })

    it('Challenge 4c: Stress test - Missing #star-count element does not crash listener setup', async () => {
        const page = new SettingsPage(mockApp)
        // Render normal page
        await page.render()

        // Remove star-count element from DOM to simulate DOM manipulation/plugin
        const starCount = document.getElementById('star-count')
        if (starCount && starCount.parentNode) {
            starCount.parentNode.removeChild(starCount)
        }

        // Re-execute setupSettingsPageListeners directly
        expect(() => page.setupSettingsPageListeners()).not.toThrow()
    })

    // -------------------------------------------------------------
    // Challenge 5: Exhaustive static file scan
    // -------------------------------------------------------------
    it('Challenge 5: Exhaustive static scan: zero occurrences of ADT109119/jijun or api.github.com/repos/ADT109119 across src/, server/, index.html, READMEs, package.json, LICENSE', () => {
        const rootDir = path.resolve(__dirname, '../../')

        // Target scan paths
        const scanTargets = [
            path.join(rootDir, 'src'),
            path.join(rootDir, 'server'),
            path.join(rootDir, 'index.html'),
            path.join(rootDir, 'README.md'),
            path.join(rootDir, 'README_en.md'),
            path.join(rootDir, 'package.json'),
            path.join(rootDir, 'LICENSE'),
            path.join(rootDir, 'CHANGE_LOG.md'),
        ]

        const forbiddenRegex = /ADT109119\/jijun\b|api\.github\.com\/repos\/ADT109119/i

        const violations = []

        function scanFile(filePath) {
            try {
                const content = fs.readFileSync(filePath, 'utf8')
                const lines = content.split('\n')
                lines.forEach((line, index) => {
                    if (forbiddenRegex.test(line)) {
                        violations.push({
                            file: path.relative(rootDir, filePath),
                            line: index + 1,
                            content: line.trim(),
                        })
                    }
                })
            } catch (err) {
                // If file doesn't exist or binary, skip
            }
        }

        function scanDirectory(dirPath) {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true })
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name)
                if (entry.isDirectory()) {
                    if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
                        scanDirectory(fullPath)
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase()
                    if (['.js', '.json', '.html', '.css', '.md', '.txt', ''].includes(ext)) {
                        scanFile(fullPath)
                    }
                }
            }
        }

        for (const target of scanTargets) {
            if (!fs.existsSync(target)) continue
            const stat = fs.statSync(target)
            if (stat.isDirectory()) {
                scanDirectory(target)
            } else if (stat.isFile()) {
                scanFile(target)
            }
        }

        expect(violations).toEqual([])
    })
})
