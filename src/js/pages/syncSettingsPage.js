import {
    showToast,
    customConfirm,
    closeModalWithAnimation,
    showProgressModal,
    formatBytes,
} from '../utils.js'

export class SyncSettingsPage {
    constructor(app) {
        this.app = app
        this.authMode = 'login' // 'login' | 'register'
    }

    async render() {
        const isSignedIn = this.app.syncService.isSignedIn()
        const userInfo = this.app.syncService.userInfo
        const serverUrl = this.app.syncService.getServerUrl()
        const defaultServerUrl =
            typeof this.app.syncService.getDefaultServerUrl === 'function'
                ? this.app.syncService.getDefaultServerUrl()
                : 'https://easy-accounting-sync.workers.cloudflare.henry-yo.top'
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

        const cleanDomain = serverUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')

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
                            <button id="sync-sign-out-btn" class="w-full py-2 text-red-500 hover:text-red-600 text-sm font-medium border border-red-500/30 hover:border-red-500/50 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer">
                                <i class="fa-solid fa-right-from-bracket mr-1"></i> 登出雲端帳號
                            </button>
                        `
                                : `
                            <div class="space-y-3">
                                <div class="flex border-b border-wabi-border mb-3">
                                    <button id="sync-tab-login" type="button" class="flex-1 pb-2 text-sm font-medium transition-colors cursor-pointer ${this.authMode === 'login' ? 'text-wabi-primary border-b-2 border-wabi-primary' : 'text-wabi-text-secondary hover:text-wabi-primary'}">
                                        帳號登入
                                    </button>
                                    <button id="sync-tab-register" type="button" class="flex-1 pb-2 text-sm font-medium transition-colors cursor-pointer ${this.authMode === 'register' ? 'text-wabi-primary border-b-2 border-wabi-primary' : 'text-wabi-text-secondary hover:text-wabi-primary'}">
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
                                <button id="sync-sign-in-btn" class="w-full py-2.5 bg-wabi-bg hover:bg-wabi-surface border border-wabi-border hover:border-wabi-primary text-wabi-text-primary rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer">
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
                        <div class="flex items-center justify-between">
                            <h3 class="text-wabi-primary text-base font-bold">雲端備份</h3>
                            <span class="text-xs px-2.5 py-0.5 rounded-full bg-wabi-primary/10 text-wabi-primary font-medium">全量備份</span>
                        </div>
                        
                        <div class="p-3 bg-wabi-bg rounded-lg border border-wabi-border space-y-1.5">
                            <div class="flex items-center justify-between text-xs">
                                <span class="text-wabi-text-secondary">上次全量備份</span>
                                <span class="font-medium text-wabi-text-primary">
                                    ${lastBackup?.value?.timestamp ? new Date(lastBackup.value.timestamp).toLocaleString('zh-TW') : '尚未備份'}
                                </span>
                            </div>
                            ${
                                lastBackup?.value?.sizeBytes !== undefined ||
                                lastBackup?.value?.recordsCount !== undefined
                                    ? `
                            <div class="flex items-center justify-between text-xs pt-1.5 border-t border-wabi-border/60">
                                <span class="text-wabi-text-secondary">已備份容量 / 筆數</span>
                                <span class="font-semibold text-wabi-primary">
                                    ${formatBytes(lastBackup.value.sizeBytes || 0)} · ${lastBackup.value.recordsCount ?? 0} 筆明細 (共 ${lastBackup.value.totalItems ?? lastBackup.value.recordsCount ?? 0} 筆資料)
                                </span>
                            </div>
                            `
                                    : ''
                            }
                        </div>

                        <div class="grid grid-cols-2 gap-3 pt-1">
                            <button id="sync-backup-btn" class="py-2.5 bg-wabi-primary text-wabi-surface rounded-lg text-sm font-medium hover:bg-wabi-primary/90 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm">
                                <i class="fa-solid fa-cloud-arrow-up"></i> 立即備份
                            </button>
                            <button id="sync-restore-btn" class="py-2.5 border border-wabi-primary text-wabi-primary rounded-lg text-sm font-medium hover:bg-wabi-primary/10 flex items-center justify-center gap-1.5 cursor-pointer">
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
                                    <button data-interval="daily" class="auto-backup-interval-btn flex-1 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${backupIntervalValue === 'daily' ? 'bg-wabi-primary text-wabi-surface border-wabi-primary' : 'bg-wabi-surface text-wabi-text-primary border-wabi-border hover:border-wabi-primary'}">每天</button>
                                    <button data-interval="3days" class="auto-backup-interval-btn flex-1 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${backupIntervalValue === '3days' ? 'bg-wabi-primary text-wabi-surface border-wabi-primary' : 'bg-wabi-surface text-wabi-text-primary border-wabi-border hover:border-wabi-primary'}">每 3 天</button>
                                    <button data-interval="weekly" class="auto-backup-interval-btn flex-1 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${backupIntervalValue === 'weekly' ? 'bg-wabi-primary text-wabi-surface border-wabi-primary' : 'bg-wabi-surface text-wabi-text-primary border-wabi-border hover:border-wabi-primary'}">每週</button>
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
                        <button id="sync-now-btn" class="w-full py-2.5 border border-wabi-border text-wabi-text-primary rounded-lg text-sm font-medium hover:bg-wabi-bg flex items-center justify-center gap-1 cursor-pointer">
                            <i class="fa-solid fa-rotate"></i> 立即同步
                        </button>
                        <p class="text-xs text-wabi-text-secondary">
                            裝置 ID: <code class="bg-wabi-bg px-1 rounded">${this.app.syncService.deviceId}</code>
                        </p>
                    </div>
                    `
                            : ''
                    }

                    <!-- Server Settings (Collapsible, at bottom) -->
                    <details id="sync-server-settings-details" class="group bg-wabi-surface rounded-xl border border-wabi-border/60 overflow-hidden transition-all">
                        <summary class="flex items-center justify-between p-4 cursor-pointer select-none hover:bg-wabi-bg/50 transition-colors">
                            <div class="flex items-center gap-2">
                                <i class="fa-solid fa-server text-wabi-text-secondary group-open:text-wabi-primary transition-colors text-sm"></i>
                                <span class="text-sm font-bold text-wabi-text-secondary group-open:text-wabi-primary transition-colors">伺服器設定</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-wabi-text-secondary font-mono truncate max-w-[150px] sm:max-w-[240px]">${cleanDomain}</span>
                                <i class="fa-solid fa-chevron-down text-xs text-wabi-text-secondary group-open:rotate-180 transition-transform duration-200"></i>
                            </div>
                        </summary>
                        <div class="p-4 pt-1 border-t border-wabi-border/40 space-y-3">
                            <div class="space-y-2">
                                <label class="text-xs text-wabi-text-secondary font-medium">同步伺服器 URL</label>
                                <div class="flex flex-wrap gap-2">
                                    <input type="url" id="sync-server-url-input"
                                        class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-wabi-border bg-wabi-surface text-sm focus:ring-wabi-primary focus:border-wabi-primary font-mono text-xs"
                                        value="${serverUrl}"
                                        placeholder="${defaultServerUrl}" />
                                    <button id="sync-server-save-btn" class="px-3 py-2 bg-wabi-primary text-wabi-surface rounded-lg text-sm font-medium hover:bg-wabi-primary/90 shrink-0 cursor-pointer">
                                        儲存
                                    </button>
                                    <button id="sync-server-reset-btn" class="px-3 py-2 bg-wabi-bg text-wabi-text-secondary rounded-lg text-sm font-medium hover:bg-wabi-surface border border-wabi-border shrink-0 cursor-pointer" title="還原預設伺服器 URL">
                                        <i class="fa-solid fa-rotate-left"></i>
                                    </button>
                                </div>
                                <p class="text-xs text-wabi-text-secondary leading-relaxed">
                                    用於雲端備份與認證的伺服器地址（預設連線至 Cloudflare Workers）
                                </p>
                            </div>
                        </div>
                    </details>

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
                const url = input ? input.value.trim() : ''
                if (!url) {
                    showToast('請輸入伺服器 URL', 'error')
                    return
                }
                await this.app.syncService.setServerUrl(url)
                showToast('伺服器 URL 已儲存', 'success')
                await this.render()
            })
        }

        // Server URL reset
        const serverResetBtn = document.getElementById('sync-server-reset-btn')
        if (serverResetBtn) {
            serverResetBtn.addEventListener('click', async () => {
                const defaultUrl =
                    typeof this.app.syncService.getDefaultServerUrl === 'function'
                        ? this.app.syncService.getDefaultServerUrl()
                        : 'https://easy-accounting-sync.workers.cloudflare.henry-yo.top'
                const input = document.getElementById('sync-server-url-input')
                if (input) input.value = defaultUrl
                await this.app.syncService.setServerUrl(defaultUrl)
                showToast('已還原預設伺服器 URL', 'success')
                await this.render()
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

                    let backupResult
                    if (typeof this.app.syncService.backupToCloud === 'function') {
                        backupResult = await this.app.syncService.backupToCloud()
                    } else {
                        backupResult = await this.app.syncService.backupToDrive()
                    }

                    const sizeText = backupResult?.sizeBytes ? formatBytes(backupResult.sizeBytes) : ''
                    const recordsCount = backupResult?.recordsCount ?? backupResult?.details?.records
                    const totalItems = backupResult?.totalItems ?? recordsCount

                    let successMsg = '全量備份成功！'
                    if (sizeText && recordsCount !== undefined) {
                        successMsg = `全量備份成功！已備份 ${sizeText} (${recordsCount} 筆明細，共 ${totalItems} 筆資料)`
                    } else if (sizeText) {
                        successMsg = `全量備份成功！已備份 ${sizeText}`
                    }

                    showToast(successMsg, 'success')
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
                            const sizeText = b.size
                                ? formatBytes(parseInt(b.size, 10))
                                : '未知大小'
                            return `<div class="backup-item-row flex items-center justify-between p-3 hover:bg-wabi-bg rounded-lg border border-wabi-border gap-2 transition-all duration-200" data-file-id="${b.id}">
                                <button class="restore-backup-item flex-1 text-left min-w-0 cursor-pointer" data-file-id="${b.id}">
                                    <p class="text-sm font-medium text-wabi-text-primary truncate">${b.name}</p>
                                    <p class="text-xs text-wabi-text-secondary">${date} · ${sizeText}</p>
                                </button>
                                <button class="delete-backup-item p-2 text-wabi-text-secondary hover:text-red-500 rounded-lg shrink-0 transition-colors cursor-pointer" data-file-id="${b.id}" title="刪除此備份">
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
                                <button id="close-restore-modal" class="p-2 text-wabi-text-secondary hover:text-wabi-primary cursor-pointer">
                                    <i class="fa-solid fa-xmark text-xl"></i>
                                </button>
                            </div>
                            <div id="backup-list-container" class="space-y-2">${listHtml}</div>
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
                                const originalHtml = btn.innerHTML
                                try {
                                    btn.disabled = true
                                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i>'

                                    await this.app.syncService.deleteBackup(fileId)
                                    showToast('已刪除雲端備份', 'success')

                                    // 立即從 DOM 列表中移除該項目，無需關閉彈窗重開
                                    const row = btn.closest('.backup-item-row')
                                    if (row) {
                                        row.style.opacity = '0'
                                        row.style.transform = 'scale(0.95)'
                                        setTimeout(() => {
                                            row.remove()
                                            const container = modal.querySelector('#backup-list-container')
                                            if (
                                                container &&
                                                container.querySelectorAll('.backup-item-row').length === 0
                                            ) {
                                                container.innerHTML = `
                                                    <div class="py-8 text-center text-wabi-text-secondary">
                                                        <i class="fa-solid fa-cloud-arrow-up text-3xl mb-2 block opacity-40"></i>
                                                        <p class="text-sm">沒有找到任何備份</p>
                                                    </div>
                                                `
                                            }
                                        }, 150)
                                    }

                                    // 背景刷新主頁面的備份卡片
                                    this.render().catch(() => {})
                                } catch (err) {
                                    console.error('Delete backup error:', err)
                                    showToast('刪除失敗：' + err.message, 'error')
                                    btn.disabled = false
                                    btn.innerHTML = originalHtml
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
                                                        progressModal.update(25 + Math.round(pct * 0.6), msg)
                                                    }
                                                }
                                            )
                                        if (result.success) {
                                            progressModal.update(88, '正在更新同步狀態...')
                                            if (typeof this.app.syncService.markAllRemoteChangesAsPulled === 'function') {
                                                await this.app.syncService.markAllRemoteChangesAsPulled()
                                            }
                                            progressModal.update(94, '正在重新載入系統設定...')
                                            await this.app.reloadAppData()
                                            progressModal.update(100, '備份還原成功！')
                                            setTimeout(() => {
                                                progressModal.close(() => {
                                                    showToast('資料已成功還原！', 'success')
                                                })
                                            }, 500)
                                        } else {
                                            progressModal.close(() => {
                                                showToast('還原失敗：' + (result.message || '未知錯誤'), 'error')
                                            })
                                        }
                                    } catch (err) {
                                        console.error('Restore error:', err)
                                        progressModal.close(() => {
                                            showToast('還原失敗：' + err.message, 'error')
                                        })
                                    }
                                })
                            })
                        })
                } catch (err) {
                    console.error('List backups error:', err)
                    showToast('取得備份列表失敗：' + err.message, 'error')
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
                await this.app.syncService.setAutoBackupEnabled(enabled)
                const container = document.getElementById(
                    'auto-backup-interval-container'
                )
                if (container) {
                    container.classList.toggle('hidden', !enabled)
                }
                showToast(
                    enabled ? '已開啟自動備份' : '已關閉自動備份',
                    'info'
                )
            })
        }

        // Auto backup interval buttons
        document
            .querySelectorAll('.auto-backup-interval-btn')
            .forEach(btn => {
                btn.addEventListener('click', async () => {
                    const interval = btn.dataset.interval
                    await this.app.syncService.setAutoBackupInterval(interval)
                    document
                        .querySelectorAll('.auto-backup-interval-btn')
                        .forEach(b => {
                            const active = b.dataset.interval === interval
                            b.className = `auto-backup-interval-btn flex-1 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                                active
                                    ? 'bg-wabi-primary text-wabi-surface border-wabi-primary'
                                    : 'bg-wabi-surface text-wabi-text-primary border-wabi-border hover:border-wabi-primary'
                            }`
                        })
                    showToast('已更新備份頻率', 'success')
                })
            })

        // Auto sync toggle
        const autoSyncToggle = document.getElementById('sync-auto-toggle')
        if (autoSyncToggle) {
            autoSyncToggle.addEventListener('change', async e => {
                const enabled = e.target.checked
                await this.app.syncService.setAutoSyncEnabled(enabled)
                showToast(
                    enabled ? '已開啟自動同步' : '已關閉自動同步',
                    'info'
                )
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
                    await this.app.syncService.sync()
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
