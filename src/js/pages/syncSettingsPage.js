import { showToast, customConfirm, closeModalWithAnimation, showProgressModal } from '../utils.js'

export class SyncSettingsPage {
    constructor(app) {
        this.app = app
        this.authMode = 'login' // 'login' | 'register'
    }

    async render() {
        const isSignedIn = this.app.syncService.isSignedIn()
        const userInfo = this.app.syncService.userInfo
        const serverUrl = this.app.syncService.getServerUrl()
        const lastBackup =
            await this.app.dataService.getSetting('sync_last_backup')
        const lastSync = await this.app.dataService.getSetting('sync_last_sync')
        const autoSyncEnabled =
            await this.app.dataService.getSetting('sync_auto_enabled')
        const autoBackupEnabled = await this.app.dataService.getSetting(
            'sync_auto_backup_enabled'
        )
        const autoBackupInterval = await this.app.dataService.getSetting(
            'sync_auto_backup_interval'
        )
        const backupIntervalValue = autoBackupInterval?.value || 'daily'

        this.app.appContainer.innerHTML = `
            <div class="page active max-w-3xl mx-auto">
                <div class="flex items-center p-4 pb-2 justify-between bg-wabi-bg sticky top-0 z-10">
                    <a href="#settings" class="text-wabi-text-secondary hover:text-wabi-primary">
                        <i class="fa-solid fa-chevron-left text-xl"></i>
                    </a>
                    <h2 class="text-wabi-primary text-lg font-bold flex-1 text-center">雲端備份&同步</h2>
                    <div class="w-8"></div>
                </div>
                <div class="p-4 space-y-6 pb-24">

                    <!-- Server Settings -->
                    <div class="bg-wabi-surface rounded-xl p-4 space-y-3">
                        <h3 class="text-wabi-primary text-base font-bold">伺服器設定</h3>
                        <div class="space-y-2">
                            <label class="text-sm text-wabi-text-secondary">同步伺服器 URL</label>
                            <div class="flex flex-wrap gap-2">
                                <input type="url" id="sync-server-url-input"
                                    class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-wabi-border bg-wabi-surface text-sm focus:ring-wabi-primary focus:border-wabi-primary"
                                    value="${serverUrl}"
                                    placeholder="https://jijun-server.the-walking-fish.com" />
                                <button id="sync-server-save-btn" class="px-3 py-2 bg-wabi-primary text-wabi-surface rounded-lg text-sm font-medium hover:bg-wabi-primary/90 shrink-0">
                                    儲存
                                </button>
                                <button id="sync-server-reset-btn" class="px-3 py-2 bg-wabi-bg text-wabi-text-secondary rounded-lg text-sm font-medium hover:bg-wabi-bg shrink-0" title="還原預設值">
                                    <i class="fa-solid fa-rotate-left"></i>
                                </button>
                            </div>
                            <p class="text-xs text-wabi-text-secondary">用於雲端備份與認證的伺服器地址</p>
                        </div>
                    </div>

                    <!-- Cloud Account -->
                    <div class="bg-wabi-surface rounded-xl p-4 space-y-3">
                        <h3 class="text-wabi-primary text-base font-bold">雲端資料庫帳號</h3>
                        ${
                            isSignedIn && userInfo
                                ? `
                            <div class="flex items-center gap-3 p-3 bg-wabi-bg rounded-lg border border-wabi-border">
                                ${userInfo.picture ? `<img src="${userInfo.picture}" class="w-10 h-10 rounded-full" alt="avatar" />` : '<div class="w-10 h-10 rounded-full bg-wabi-primary/20 flex items-center justify-center"><i class="fa-solid fa-user text-wabi-primary"></i></div>'}
                                <div class="flex-1 min-w-0">
                                    <p class="font-medium text-wabi-text-primary truncate">${userInfo.name || userInfo.username || '雲端使用者'}</p>
                                    <p class="text-xs text-wabi-text-secondary truncate">${userInfo.email || `帳號：${userInfo.username || ''}`}</p>
                                </div>
                                <span class="text-xs px-2 py-1 bg-wabi-income/15 text-wabi-income border border-wabi-income/30 rounded-full font-medium">已連線</span>
                            </div>
                            <button id="sync-sign-out-btn" class="w-full py-2 text-red-500 hover:text-red-600 text-sm font-medium border border-red-500/30 hover:border-red-500/50 hover:bg-red-500/10 rounded-lg transition-colors">
                                <i class="fa-solid fa-right-from-bracket mr-1"></i> 登出雲端帳號
                            </button>
                        `
                                : `
                            <div class="space-y-3">
                                <div class="flex border-b border-wabi-border mb-3">
                                    <button id="sync-tab-login" type="button" class="flex-1 pb-2 text-sm font-medium transition-colors ${this.authMode === 'login' ? 'text-wabi-primary border-b-2 border-wabi-primary' : 'text-wabi-text-secondary hover:text-wabi-primary'}">
                                        帳號登入
                                    </button>
                                    <button id="sync-tab-register" type="button" class="flex-1 pb-2 text-sm font-medium transition-colors ${this.authMode === 'register' ? 'text-wabi-primary border-b-2 border-wabi-primary' : 'text-wabi-text-secondary hover:text-wabi-primary'}">
                                        註冊新帳號
                                    </button>
                                </div>
                                <div class="space-y-3">
                                    <div>
                                        <label class="text-xs text-wabi-text-secondary block mb-1">使用者名稱</label>
                                        <input type="text" id="sync-username-input" class="w-full px-3 py-2 rounded-lg border border-wabi-border bg-wabi-surface text-sm text-wabi-text-primary focus:ring-wabi-primary focus:border-wabi-primary" placeholder="請輸入使用者名稱" autocomplete="username" />
                                    </div>
                                    <div>
                                        <label class="text-xs text-wabi-text-secondary block mb-1">密碼</label>
                                        <input type="password" id="sync-password-input" class="w-full px-3 py-2 rounded-lg border border-wabi-border bg-wabi-surface text-sm text-wabi-text-primary focus:ring-wabi-primary focus:border-wabi-primary" placeholder="請輸入密碼 (至少 6 碼)" autocomplete="${this.authMode === 'register' ? 'new-password' : 'current-password'}" />
                                    </div>
                                    ${
                                        this.authMode === 'register'
                                            ? `
                                    <div>
                                        <label class="text-xs text-wabi-text-secondary block mb-1">確認密碼</label>
                                        <input type="password" id="sync-confirm-password-input" class="w-full px-3 py-2 rounded-lg border border-wabi-border bg-wabi-surface text-sm text-wabi-text-primary focus:ring-wabi-primary focus:border-wabi-primary" placeholder="請再次輸入密碼" autocomplete="new-password" />
                                    </div>
                                    `
                                            : ''
                                    }
                                </div>
                                <button id="sync-sign-in-btn" class="w-full py-2.5 bg-wabi-bg hover:bg-wabi-surface border border-wabi-border hover:border-wabi-primary text-wabi-text-primary rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2">
                                    <i class="fa-solid ${this.authMode === 'register' ? 'fa-user-plus' : 'fa-right-to-bracket'} text-wabi-text-primary"></i>
                                    <span class="text-sm font-medium text-wabi-text-primary">${this.authMode === 'register' ? '建立帳號並登入' : '登入雲端帳號'}</span>
                                </button>
                                <p class="text-xs text-center text-wabi-text-secondary">資料庫安全加密連線儲存</p>
                            </div>
                        `
                        }
                    </div>

                    ${
                        isSignedIn
                            ? `
                    <!-- Backup -->
                    <div class="bg-wabi-surface rounded-xl p-4 space-y-3">
                        <h3 class="text-wabi-primary text-base font-bold">雲端備份</h3>
                        <p class="text-xs text-wabi-text-secondary">
                            上次備份：${lastBackup?.value?.timestamp ? new Date(lastBackup.value.timestamp).toLocaleString('zh-TW') : '尚未備份'}
                        </p>
                        <div class="grid grid-cols-2 gap-3">
                            <button id="sync-backup-btn" class="py-2.5 bg-wabi-primary text-wabi-surface rounded-lg text-sm font-medium hover:bg-wabi-primary/90 flex items-center justify-center gap-1">
                                <i class="fa-solid fa-cloud-arrow-up"></i> 立即備份
                            </button>
                            <button id="sync-restore-btn" class="py-2.5 border border-wabi-primary text-wabi-primary rounded-lg text-sm font-medium hover:bg-wabi-primary/10 flex items-center justify-center gap-1">
                                <i class="fa-solid fa-cloud-arrow-down"></i> 還原備份
                            </button>
                        </div>

                        <!-- Auto Backup -->
                        <div class="border-t border-wabi-border pt-3 space-y-3">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-sm text-wabi-text-primary">自動備份</p>
                                    <p class="text-xs text-wabi-text-secondary">定期自動備份到 PostgreSQL 資料庫</p>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" id="sync-auto-backup-toggle" class="sr-only peer" ${autoBackupEnabled?.value ? 'checked' : ''}>
                                <div class="w-11 h-6 bg-wabi-bg border border-wabi-border rounded-full peer peer-focus:ring-4 peer-focus:ring-wabi-accent/30 peer-checked:bg-wabi-primary peer-checked:border-wabi-primary transition-colors"></div>
                                    <span class="absolute left-1 top-1 w-4 h-4 bg-wabi-surface rounded-full transition-transform peer-checked:translate-x-full"></span>
                                </label>
                            </div>
                            <div id="auto-backup-interval-container" class="${autoBackupEnabled?.value ? '' : 'hidden'}">
                                <label class="text-xs text-wabi-text-secondary mb-1 block">備份頻率</label>
                                <div class="flex gap-2">
                                    <button data-interval="daily" class="auto-backup-interval-btn flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${backupIntervalValue === 'daily' ? 'bg-wabi-primary text-wabi-surface border-wabi-primary' : 'bg-wabi-surface text-wabi-text-primary border-wabi-border hover:border-wabi-primary'}">每天</button>
                                    <button data-interval="3days" class="auto-backup-interval-btn flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${backupIntervalValue === '3days' ? 'bg-wabi-primary text-wabi-surface border-wabi-primary' : 'bg-wabi-surface text-wabi-text-primary border-wabi-border hover:border-wabi-primary'}">每 3 天</button>
                                    <button data-interval="weekly" class="auto-backup-interval-btn flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${backupIntervalValue === 'weekly' ? 'bg-wabi-primary text-wabi-surface border-wabi-primary' : 'bg-wabi-surface text-wabi-text-primary border-wabi-border hover:border-wabi-primary'}">每週</button>
                                </div>
                            </div>
                            <p class="text-xs text-wabi-text-secondary">
                                <i class="fa-solid fa-circle-info mr-1"></i>
                                備份保留策略：近 7 天的備份全部保留，更早的每月僅保留一筆，超過一年的自動刪除。
                            </p>
                        </div>
                    </div>

                    <!-- Multi-device Sync -->
                    <div class="bg-wabi-surface rounded-xl p-4 space-y-3">
                        <h3 class="text-wabi-primary text-base font-bold">多裝置同步(Beta)</h3>
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-sm text-wabi-text-primary">自動同步</p>
                                <p class="text-xs text-wabi-text-secondary">
                                    上次同步：${lastSync?.value ? new Date(lastSync.value).toLocaleString('zh-TW') : '尚未同步'}
                                </p>
                            </div>
                            <label class="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" id="sync-auto-toggle" class="sr-only peer" ${autoSyncEnabled?.value ? 'checked' : ''}>
                                <div class="w-11 h-6 bg-wabi-bg border border-wabi-border rounded-full peer peer-focus:ring-4 peer-focus:ring-wabi-accent/30 peer-checked:bg-wabi-primary peer-checked:border-wabi-primary transition-colors"></div>
                                <span class="absolute left-1 top-1 w-4 h-4 bg-wabi-surface rounded-full transition-transform peer-checked:translate-x-full"></span>
                            </label>
                        </div>
                        <button id="sync-now-btn" class="w-full py-2.5 border border-wabi-border text-wabi-text-primary rounded-lg text-sm font-medium hover:bg-wabi-bg flex items-center justify-center gap-1">
                            <i class="fa-solid fa-rotate"></i> 立即同步
                        </button>
                        <p class="text-xs text-wabi-text-secondary">
                            裝置 ID: <code class="bg-wabi-bg px-1 rounded">${this.app.syncService.deviceId}</code>
                        </p>
                    </div>
                    `
                            : ''
                    }

                </div>
            </div>
        `
        this.setupSyncSettingsListeners()
    }

    setupSyncSettingsListeners() {
        // Server URL save
        const serverSaveBtn = document.getElementById('sync-server-save-btn')
        if (serverSaveBtn) {
            serverSaveBtn.addEventListener('click', async () => {
                const input = document.getElementById('sync-server-url-input')
                const url = input.value.trim()
                if (!url) {
                    showToast('請輸入伺服器 URL', 'error')
                    return
                }
                await this.app.syncService.setServerUrl(url)
                showToast('伺服器 URL 已儲存', 'success')
            })
        }

        // Server URL reset
        const serverResetBtn = document.getElementById('sync-server-reset-btn')
        if (serverResetBtn) {
            serverResetBtn.addEventListener('click', async () => {
                const defaultUrl = 'https://jijun-server.the-walking-fish.com'
                const input = document.getElementById('sync-server-url-input')
                if (input) input.value = defaultUrl
                await this.app.syncService.setServerUrl(defaultUrl)
                showToast('已還原預設伺服器 URL', 'success')
            })
        }

        // Auth Tabs
        const tabLogin = document.getElementById('sync-tab-login')
        const tabRegister = document.getElementById('sync-tab-register')
        if (tabLogin) {
            tabLogin.addEventListener('click', async () => {
                this.authMode = 'login'
                await this.render()
            })
        }
        if (tabRegister) {
            tabRegister.addEventListener('click', async () => {
                this.authMode = 'register'
                await this.render()
            })
        }

        // Sign in / Register
        const signInBtn = document.getElementById('sync-sign-in-btn')
        if (signInBtn) {
            signInBtn.addEventListener('click', async () => {
                const usernameInput = document.getElementById('sync-username-input')
                const passwordInput = document.getElementById('sync-password-input')
                const confirmPasswordInput = document.getElementById(
                    'sync-confirm-password-input'
                )

                const username = usernameInput ? usernameInput.value.trim() : ''
                const password = passwordInput ? passwordInput.value : ''

                if (usernameInput && passwordInput) {
                    if (this.authMode === 'register') {
                        if (!username) {
                            showToast('請輸入使用者名稱', 'error')
                            return
                        }
                        if (!password || password.length < 6) {
                            showToast('密碼長度需至少 6 個字元', 'error')
                            return
                        }
                        const confirmPassword = confirmPasswordInput
                            ? confirmPasswordInput.value
                            : ''
                        if (password !== confirmPassword) {
                            showToast('兩次輸入的密碼不一致', 'error')
                            return
                        }
                    } else {
                        if (!username || !password) {
                            showToast('請輸入使用者名稱與密碼', 'error')
                            return
                        }
                    }
                }

                try {
                    signInBtn.disabled = true
                    signInBtn.innerHTML =
                        '<i class="fa-solid fa-spinner fa-spin text-wabi-text-primary"></i> <span class="text-sm font-medium text-wabi-text-primary">處理中...</span>'

                    if (this.authMode === 'register') {
                        if (typeof this.app.syncService.register === 'function') {
                            await this.app.syncService.register(username, password)
                        } else {
                            await this.app.syncService.signIn({ username, password })
                        }
                        showToast('帳號註冊並登入成功！', 'success')
                    } else {
                        if (
                            username &&
                            password &&
                            typeof this.app.syncService.login === 'function'
                        ) {
                            await this.app.syncService.login(username, password)
                        } else {
                            await this.app.syncService.signIn({ username, password })
                        }
                        showToast('雲端帳號登入成功！', 'success')
                    }
                    await this.render()
                } catch (err) {
                    console.error('Sign in error:', err)
                    showToast(
                        (this.authMode === 'register' ? '註冊失敗：' : '登入失敗：') +
                            err.message,
                        'error'
                    )
                    signInBtn.disabled = false
                    const label =
                        this.authMode === 'register' ? '建立帳號並登入' : '登入雲端帳號'
                    const icon =
                        this.authMode === 'register'
                            ? 'fa-user-plus'
                            : 'fa-right-to-bracket'
                    signInBtn.innerHTML = `<i class="fa-solid ${icon} text-wabi-text-primary"></i> <span class="text-sm font-medium text-wabi-text-primary">${label}</span>`
                }
            })
        }

        // Sign out
        const signOutBtn = document.getElementById('sync-sign-out-btn')
        if (signOutBtn) {
            signOutBtn.addEventListener('click', async () => {
                if (
                    !(await customConfirm(
                        '確定要登出雲端帳號？這會停止自動備份與同步。'
                    ))
                )
                    return
                await this.app.syncService.signOut()
                showToast('已登出雲端帳號', 'success')
                await this.render()
            })
        }

        // Backup
        const backupBtn = document.getElementById('sync-backup-btn')
        if (backupBtn) {
            backupBtn.addEventListener('click', async () => {
                try {
                    backupBtn.disabled = true
                    backupBtn.innerHTML =
                        '<i class="fa-solid fa-spinner fa-spin"></i> 備份中...'
                    if (typeof this.app.syncService.backupToCloud === 'function') {
                        await this.app.syncService.backupToCloud()
                    } else {
                        await this.app.syncService.backupToDrive()
                    }
                    showToast('備份成功！', 'success')
                    await this.render()
                } catch (err) {
                    console.error('Backup error:', err)
                    showToast('備份失敗：' + err.message, 'error')
                    backupBtn.disabled = false
                    backupBtn.innerHTML =
                        '<i class="fa-solid fa-cloud-arrow-up"></i> 立即備份'
                }
            })
        }

        // Restore
        const restoreBtn = document.getElementById('sync-restore-btn')
        if (restoreBtn) {
            restoreBtn.addEventListener('click', async () => {
                try {
                    const backups = await this.app.syncService.listBackups()
                    if (backups.length === 0) {
                        showToast('沒有找到任何備份', 'info')
                        return
                    }
                    // Show backup selection
                    const listHtml = backups
                        .map(b => {
                            const date = new Date(b.createdTime).toLocaleString(
                                'zh-TW'
                            )
                            const sizeKB = b.size
                                ? (parseInt(b.size) / 1024).toFixed(1)
                                : '?'
                            return `<div class="flex items-center justify-between p-3 hover:bg-wabi-bg rounded-lg border border-wabi-border gap-2">
                                <button class="restore-backup-item flex-1 text-left min-w-0" data-file-id="${b.id}">
                                    <p class="text-sm font-medium text-wabi-text-primary truncate">${b.name}</p>
                                    <p class="text-xs text-wabi-text-secondary">${date} · ${sizeKB} KB</p>
                                </button>
                                <button class="delete-backup-item p-2 text-wabi-text-secondary hover:text-red-500 rounded-lg shrink-0 transition-colors" data-file-id="${b.id}" title="刪除此備份">
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            </div>`
                        })
                        .join('')

                    const modal = document.createElement('div')
                    modal.className =
                        'fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in'
                    modal.innerHTML = `
                        <div class="bg-wabi-surface w-full max-w-lg rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto animate-slide-up">
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="text-lg font-bold text-wabi-primary">選擇備份</h3>
                                <button id="close-restore-modal" class="p-2 text-wabi-text-secondary hover:text-wabi-primary">
                                    <i class="fa-solid fa-xmark text-xl"></i>
                                </button>
                            </div>
                            <div class="space-y-2">${listHtml}</div>
                        </div>
                    `
                    document.body.appendChild(modal)

                    const closeModal = (cb) => closeModalWithAnimation(modal, modal.firstElementChild, cb)

                    modal
                        .querySelector('#close-restore-modal')
                        .addEventListener('click', () => closeModal())
                    modal.addEventListener('click', e => {
                        if (e.target === modal) closeModal()
                    })

                    modal
                        .querySelectorAll('.delete-backup-item')
                        .forEach(btn => {
                            btn.addEventListener('click', async e => {
                                e.stopPropagation()
                                if (
                                    !(await customConfirm(
                                        '確定要刪除這筆雲端備份？刪除後無法復原。'
                                    ))
                                )
                                    return
                                const fileId = btn.dataset.fileId
                                try {
                                    await this.app.syncService.deleteBackup(fileId)
                                    showToast('已刪除雲端備份', 'success')
                                    closeModal(() => {
                                        restoreBtn.click()
                                    })
                                } catch (err) {
                                    showToast('刪除失敗：' + err.message, 'error')
                                }
                            })
                        })

                    modal
                        .querySelectorAll('.restore-backup-item')
                        .forEach(btn => {
                            btn.addEventListener('click', async () => {
                                if (
                                    !(await customConfirm(
                                        '確定要從此備份還原？這將覆蓋目前的所有資料。'
                                    ))
                                )
                                    return
                                const fileId = btn.dataset.fileId
                                closeModal(async () => {
                                    const progressModal = showProgressModal(
                                        '雲端還原',
                                        '正在從雲端下載備份...'
                                    )
                                    progressModal.update(10, '正在從雲端資料庫下載備份...')
                                    try {
                                        const backupData =
                                            typeof this.app.syncService.restoreFromCloud === 'function'
                                                ? await this.app.syncService.restoreFromCloud(fileId)
                                                : await this.app.syncService.restoreFromDrive(fileId)
                                        progressModal.update(25, '正在準備還原資料...')
                                        // Use the import logic — create a temporary blob
                                        const blob = new Blob(
                                            [JSON.stringify(backupData)],
                                            {
                                                type: 'application/json',
                                            }
                                        )
                                        const file = new File(
                                            [blob],
                                            'restore.json',
                                            {
                                                type: 'application/json',
                                            }
                                        )
                                        const result =
                                            await this.app.dataService.importData(
                                                file,
                                                {
                                                    skipConfirm: true,
                                                    onProgress: (pct, msg) => {
                                                        // Map 0-100% of import to 25% - 85%
                                                        progressModal.update(25 + Math.round(pct * 0.6), msg)
                                                    }
                                                }
                                            )
                                        if (result.success) {
                                            progressModal.update(88, '正在更新同步狀態...')
                                            // Reset sync history to avoid replaying old changes
                                            if (typeof this.app.syncService.markAllRemoteChangesAsPulled === 'function') {
                                                await this.app.syncService.markAllRemoteChangesAsPulled()
                                            }
                                            progressModal.update(94, '正在重新載入系統設定...')
                                            await this.app.reloadAppData()
                                            progressModal.update(100, '備份還原成功！')
                                            setTimeout(() => {
                                                progressModal.close(() => {
                                                    showToast(
                                                        '備份還原成功！正在重新載入...',
                                                        'success'
                                                    )
                                                    this.app.currentHash = null
                                                    window.location.hash = '#home'
                                                    setTimeout(() => {
                                                        window.location.reload()
                                                    }, 300)
                                                })
                                            }, 500)
                                        } else {
                                            progressModal.close()
                                            showToast(
                                                result.message || '還原失敗',
                                                'error'
                                            )
                                        }
                                    } catch (err) {
                                        progressModal.close()
                                        showToast(
                                            '還原失敗：' + err.message,
                                            'error'
                                        )
                                    }
                                })
                            })
                        })
                } catch (err) {
                    showToast('載入備份列表失敗：' + err.message, 'error')
                }
            })
        }

        // Auto backup toggle
        const autoBackupToggle = document.getElementById(
            'sync-auto-backup-toggle'
        )
        if (autoBackupToggle) {
            autoBackupToggle.addEventListener('change', async e => {
                const enabled = e.target.checked
                await this.app.dataService.saveSetting({
                    key: 'sync_auto_backup_enabled',
                    value: enabled,
                })
                const intervalContainer = document.getElementById(
                    'auto-backup-interval-container'
                )
                if (enabled) {
                    const intervalSetting =
                        await this.app.dataService.getSetting(
                            'sync_auto_backup_interval'
                        )
                    const interval = intervalSetting?.value || 'daily'
                    this.app.syncService.startAutoBackup(interval)
                    if (intervalContainer)
                        intervalContainer.classList.remove('hidden')
                    showToast('已啟用自動備份', 'success')
                } else {
                    this.app.syncService.stopAutoBackup()
                    if (intervalContainer)
                        intervalContainer.classList.add('hidden')
                    showToast('已停用自動備份', 'info')
                }
            })
        }

        // Auto backup interval buttons
        document.querySelectorAll('.auto-backup-interval-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const interval = btn.dataset.interval
                await this.app.dataService.saveSetting({
                    key: 'sync_auto_backup_interval',
                    value: interval,
                })
                // Update button styles
                document
                    .querySelectorAll('.auto-backup-interval-btn')
                    .forEach(b => {
                        b.className = b.className.replace(
                            /bg-wabi-primary text-wabi-surface border-wabi-primary/g,
                            'bg-wabi-surface text-wabi-text-primary border-wabi-border hover:border-wabi-primary'
                        )
                    })
                btn.className = btn.className.replace(
                    /bg-wabi-surface text-wabi-text-primary border-wabi-border hover:border-wabi-primary/g,
                    'bg-wabi-primary text-wabi-surface border-wabi-primary'
                )
                // Restart auto backup with new interval
                const autoBackupSetting = await this.app.dataService.getSetting(
                    'sync_auto_backup_enabled'
                )
                if (autoBackupSetting?.value) {
                    this.app.syncService.startAutoBackup(interval)
                }
                const labels = {
                    daily: '每天',
                    '3days': '每 3 天',
                    weekly: '每週',
                }
                showToast(`備份頻率已設定為${labels[interval]}`, 'success')
            })
        })

        // Auto sync toggle
        const autoSyncToggle = document.getElementById('sync-auto-toggle')
        if (autoSyncToggle) {
            autoSyncToggle.addEventListener('change', async e => {
                const enabled = e.target.checked
                await this.app.dataService.saveSetting({
                    key: 'sync_auto_enabled',
                    value: enabled,
                })
                if (enabled) {
                    this.app.syncService.startAutoSync(24 * 60 * 60 * 1000)
                    showToast('已啟用自動同步', 'success')
                } else {
                    this.app.syncService.stopAutoSync()
                    showToast('已停用自動同步', 'info')
                }
            })
        }

        // Sync now
        const syncNowBtn = document.getElementById('sync-now-btn')
        if (syncNowBtn) {
            syncNowBtn.addEventListener('click', async () => {
                try {
                    syncNowBtn.disabled = true
                    syncNowBtn.innerHTML =
                        '<i class="fa-solid fa-spinner fa-spin"></i> 同步中...'
                    await this.app.syncService.performSync()
                    showToast('同步完成！', 'success')
                    await this.render()
                } catch (err) {
                    console.error('Sync error:', err)
                    showToast('同步失敗：' + err.message, 'error')
                    syncNowBtn.disabled = false
                    syncNowBtn.innerHTML =
                        '<i class="fa-solid fa-rotate"></i> 立即同步'
                }
            })
        }
    }
}
