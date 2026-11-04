import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncService } from '../../src/js/syncService.js'

describe('SyncService PostgreSQL Authentication & Cloud Backup', () => {
    let mockDataService
    let syncService
    let originalFetch

    beforeEach(() => {
        originalFetch = globalThis.fetch

        mockDataService = {
            settings: {},
            getSetting: vi.fn(async (key) => {
                return mockDataService.settings[key] ? { value: mockDataService.settings[key] } : null
            }),
            saveSetting: vi.fn(async ({ key, value }) => {
                mockDataService.settings[key] = value
            }),
            getLedgers: vi.fn(async () => []),
            exportDataForSync: vi.fn(async () => ({
                version: 15,
                records: [{ id: 1, amount: 100, note: '測試午餐' }],
                ledgers: [{ id: 1, name: '個人帳本' }],
            })),
        }

        syncService = new SyncService(mockDataService)
        syncService.serverUrl = 'http://localhost:8787'
    })

    afterEach(() => {
        globalThis.fetch = originalFetch
        vi.restoreAllMocks()
    })

    describe('使用者註冊 (register)', () => {
        it('成功註冊時應儲存 Token 與 UserInfo', async () => {
            const fakeUser = { id: 10, username: 'testuser_pg' }
            const fakeToken = 'mock_session_token_12345'
            const fakeExpiresAt = new Date(Date.now() + 86400000).toISOString()

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    user: fakeUser,
                    token: fakeToken,
                    expiresAt: fakeExpiresAt,
                }),
            })

            const res = await syncService.register('testuser_pg', 'password123')

            expect(res.user.username).toBe('testuser_pg')
            expect(syncService.accessToken).toBe(fakeToken)
            expect(syncService.refreshToken).toBe(fakeToken)
            expect(syncService.userInfo.username).toBe('testuser_pg')
            expect(syncService.isSignedIn()).toBe(true)
            expect(mockDataService.saveSetting).toHaveBeenCalledWith({
                key: 'sync_tokens',
                value: expect.objectContaining({
                    access_token: fakeToken,
                    refresh_token: fakeToken,
                    user_info: expect.objectContaining({ username: 'testuser_pg' }),
                }),
            })
        })

        it('使用者名稱過短時應直接拋錯不發起請求', async () => {
            const fetchSpy = vi.fn()
            globalThis.fetch = fetchSpy

            await expect(syncService.register('a', 'password123')).rejects.toThrow(
                '使用者名稱長度需至少 2 個字元'
            )
            expect(fetchSpy).not.toHaveBeenCalled()
        })

        it('密碼過短時應直接拋錯不發起請求', async () => {
            const fetchSpy = vi.fn()
            globalThis.fetch = fetchSpy

            await expect(syncService.register('validuser', '123')).rejects.toThrow(
                '密碼長度需至少 6 個字元'
            )
            expect(fetchSpy).not.toHaveBeenCalled()
        })
    })

    describe('使用者登入 (login & signIn)', () => {
        it('成功登入時應儲存 Session Token', async () => {
            const fakeUser = { id: 12, username: 'loginuser' }
            const fakeToken = 'login_token_abc'

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({
                    user: fakeUser,
                    token: fakeToken,
                    expiresAt: new Date(Date.now() + 86400000).toISOString(),
                }),
            })

            const res = await syncService.login('loginuser', 'correct_password')

            expect(res.token).toBe(fakeToken)
            expect(syncService.accessToken).toBe(fakeToken)
            expect(syncService.isSignedIn()).toBe(true)
            expect(syncService.userInfo.username).toBe('loginuser')
        })

        it('登入密碼錯誤時應拋出伺服器錯誤訊息', async () => {
            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                json: async () => ({
                    error: '密碼錯誤',
                }),
            })

            await expect(syncService.login('loginuser', 'wrong_pass')).rejects.toThrow(
                '密碼錯誤'
            )
            expect(syncService.isSignedIn()).toBe(false)
        })

        it('signIn 傳入帳密物件時應代理至 login', async () => {
            const loginSpy = vi.spyOn(syncService, 'login').mockResolvedValue({ token: 't' })
            const success = await syncService.signIn({ username: 'u', password: 'p' })
            expect(success).toBe(true)
            expect(loginSpy).toHaveBeenCalledWith('u', 'p')
        })
    })

    describe('使用者登出 (signOut)', () => {
        it('登出時應呼叫後端 logout API 並清理本機狀態與 tokens', async () => {
            syncService.accessToken = 'token_to_logout'
            syncService.refreshToken = 'token_to_logout'
            syncService.userInfo = { id: 1, username: 'user1' }

            let logoutCalled = false
            globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
                if (url.includes('/api/auth/logout')) {
                    logoutCalled = true
                    expect(opts.headers.Authorization).toBe('Bearer token_to_logout')
                    return { ok: true, json: async () => ({ success: true }) }
                }
                return { ok: true, json: async () => ({}) }
            })

            await syncService.signOut()

            expect(logoutCalled).toBe(true)
            expect(syncService.accessToken).toBeNull()
            expect(syncService.refreshToken).toBeNull()
            expect(syncService.userInfo).toBeNull()
            expect(syncService.isSignedIn()).toBe(false)
            expect(mockDataService.saveSetting).toHaveBeenCalledWith({
                key: 'sync_tokens',
                value: null,
            })
        })
    })

    describe('雲端備份與還原 (backupToCloud / listBackups / restoreFromCloud / deleteBackup)', () => {
        beforeEach(() => {
            syncService.accessToken = 'valid_token'
            syncService.refreshToken = 'valid_token'
            syncService.userInfo = { id: 1, username: 'test_user' }
            syncService.tokenExpiresAt = Date.now() + 3600000
        })

        it('backupToCloud 應匯出資料並發送至 POST /api/backup', async () => {
            let capturedBody = null
            globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
                if (url.endsWith('/api/backup') && opts.method === 'POST') {
                    capturedBody = JSON.parse(opts.body)
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            success: true,
                            backup: {
                                id: 99,
                                file_name: capturedBody.fileName,
                                size_bytes: 1234,
                                device_id: syncService.deviceId,
                            },
                        }),
                    }
                }
                return { ok: false, status: 404, json: async () => ({}) }
            })

            const meta = await syncService.backupToCloud()

            expect(meta.id).toBe(99)
            expect(capturedBody).not.toBeNull()
            expect(capturedBody.data.records).toHaveLength(1)
            expect(mockDataService.saveSetting).toHaveBeenCalledWith(
                expect.objectContaining({
                    key: 'sync_last_backup',
                })
            )
        })

        it('backupToDrive 應為 backupToCloud 之同義別名', async () => {
            const spy = vi.spyOn(syncService, 'backupToCloud').mockResolvedValue({ id: 101 })
            const res = await syncService.backupToDrive()
            expect(res.id).toBe(101)
            expect(spy).toHaveBeenCalled()
        })

        it('listBackups 應發起 GET /api/backup 並標準化資料欄位', async () => {
            globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
                if (url.endsWith('/api/backup') && (!opts || opts.method === 'GET')) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            backups: [
                                {
                                    id: 1,
                                    file_name: 'backup_2026-11-01.json',
                                    size_bytes: 5678,
                                    created_at: '2026-11-01T10:00:00Z',
                                    device_id: 'dev-1',
                                },
                            ],
                        }),
                    }
                }
                return { ok: false, status: 404, json: async () => ({}) }
            })

            const list = await syncService.listBackups()

            expect(list).toHaveLength(1)
            expect(list[0].id).toBe('1')
            expect(list[0].name).toBe('backup_2026-11-01.json')
            expect(list[0].size).toBe(5678)
            expect(list[0].createdTime).toBe('2026-11-01T10:00:00Z')
        })

        it('restoreFromCloud 應發起 GET /api/backup/:id 並回傳備份資料內容', async () => {
            const backupPayload = {
                version: 15,
                records: [{ id: 10, amount: 500, note: '晚餐' }],
            }

            globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
                if (url.endsWith('/api/backup/42') && (!opts || opts.method === 'GET')) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            backup: {
                                id: 42,
                                file_name: 'backup_test.json',
                                data: backupPayload,
                            },
                        }),
                    }
                }
                return { ok: false, status: 404, json: async () => ({}) }
            })

            const restored = await syncService.restoreFromCloud(42)

            expect(restored.version).toBe(15)
            expect(restored.records[0].amount).toBe(500)
        })

        it('restoreFromDrive 應為 restoreFromCloud 之同義別名', async () => {
            const spy = vi.spyOn(syncService, 'restoreFromCloud').mockResolvedValue({ ok: true })
            const res = await syncService.restoreFromDrive('42')
            expect(res.ok).toBe(true)
            expect(spy).toHaveBeenCalledWith('42')
        })

        it('deleteBackup 應發起 DELETE /api/backup/:id', async () => {
            let deleteUrl = null
            globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
                if (opts.method === 'DELETE') {
                    deleteUrl = url
                    return { ok: true, status: 200, json: async () => ({ success: true }) }
                }
                return { ok: false, status: 404, json: async () => ({}) }
            })

            const ok = await syncService.deleteBackup(88)

            expect(ok).toBe(true)
            expect(deleteUrl).toContain('/api/backup/88')
        })
    })
})
