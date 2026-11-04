import { showToast, escapeHTML } from './utils.js'
import { isVersionNewer } from './pages/settingsPage.js'
import { registerPlugin } from '@capacitor/core'

export const GITHUB_LATEST_RELEASE_URL =
    'https://api.github.com/repos/s96281/jijun/releases/latest'

/**
 * 依據裝置支援的 CPU 架構 (ABI) 優先挑選最適合的 APK 資產
 * 優先序：裝置第一偏好架構 (如 arm64-v8a) > universal 通用架構 > 任意 APK
 *
 * @param {Array<{name: string, browser_download_url: string}>} assets
 * @param {string[]} supportedAbis
 * @returns {{name: string, browser_download_url: string}|null}
 */
export function selectApkAsset(assets, supportedAbis = []) {
    if (!Array.isArray(assets) || assets.length === 0) return null

    const apkAssets = assets.filter(
        a => a.name && a.name.toLowerCase().endsWith('.apk')
    )
    if (apkAssets.length === 0) return null

    // 1. 優先匹配裝置支援的架構（例如 arm64-v8a）
    for (const abi of supportedAbis) {
        if (!abi) continue
        const matched = apkAssets.find(a =>
            a.name.toLowerCase().includes(abi.toLowerCase())
        )
        if (matched) return matched
    }

    // 2. 次選通用 universal 架構
    const universal = apkAssets.find(a =>
        a.name.toLowerCase().includes('universal')
    )
    if (universal) return universal

    // 3. 兜底任意 APK
    return apkAssets[0]
}

/**
 * 格式化檔案大小
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const formatted = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)
    return `${formatted} ${units[i]}`
}

let AppUpdatePluginInstance = null

/**
 * 重設外掛快取實例 (主要供單元測試或熱更新重置狀態使用)
 */
export function resetAppUpdatePlugin() {
    AppUpdatePluginInstance = null
}

/**
 * 取得 AppUpdate 原生插件實例
 * 優先使用全域 Capacitor Plugins，次選 registerPlugin 註冊代理
 *
 * @returns {Object|null}
 */
export function getAppUpdatePlugin() {
    if (AppUpdatePluginInstance) return AppUpdatePluginInstance
    const isNativeAndroid =
        typeof window !== 'undefined' &&
        Boolean(window.Capacitor?.isNativePlatform?.()) &&
        window.Capacitor?.getPlatform?.() === 'android'

    if (!isNativeAndroid) return null

    try {
        if (window.Capacitor?.Plugins?.AppUpdate) {
            AppUpdatePluginInstance = window.Capacitor.Plugins.AppUpdate
            return AppUpdatePluginInstance
        }
        if (typeof registerPlugin === 'function') {
            AppUpdatePluginInstance = registerPlugin('AppUpdate')
            return AppUpdatePluginInstance
        }
        if (typeof window.Capacitor?.registerPlugin === 'function') {
            AppUpdatePluginInstance = window.Capacitor.registerPlugin('AppUpdate')
            return AppUpdatePluginInstance
        }
    } catch (e) {
        console.warn('[AppUpdateService] 註冊 AppUpdate 插件失敗:', e)
    }
    return null
}

/**
 * 安全地開啟外部下載連結或網頁
 * 在 Android 原生環境下避免 window.open 被 WebView 靜默丟棄的問題，
 * 優先呼叫原生 Intent 打開系統瀏覽器，次選以 location.href 觸發外部瀏覽器
 *
 * @param {string} url
 */
export async function openExternalUrl(url) {
    if (!url) return
    const isNativeAndroid =
        typeof window !== 'undefined' &&
        Boolean(window.Capacitor?.isNativePlatform?.()) &&
        window.Capacitor?.getPlatform?.() === 'android'

    if (isNativeAndroid) {
        const plugin = getAppUpdatePlugin()
        if (plugin && typeof plugin.openInBrowser === 'function') {
            try {
                await plugin.openInBrowser({ url })
                return
            } catch (e) {
                console.warn('[AppUpdateService] plugin.openInBrowser 失敗，嘗試 window.location:', e)
            }
        }
        try {
            window.location.href = url
            return
        } catch (_) {}
    }

    try {
        window.open(url, '_blank')
    } catch (_) {
        window.location.href = url
    }
}

/**
 * Android 應用程式更新服務
 * 負責檢查 GitHub 最新正式 Release、彈出通知並執行在線 APK 下載與覆蓋安裝
 */
export class AppUpdateService {
    constructor(app) {
        this.app = app
        this.currentDownloadListener = null
        this.activeModal = null
        this.isChecking = false
    }

    /**
     * 判斷目前是否在 Android Capacitor 原生環境中執行
     */
    isAndroidNative() {
        return (
            typeof window !== 'undefined' &&
            Boolean(window.Capacitor?.isNativePlatform?.()) &&
            window.Capacitor?.getPlatform?.() === 'android'
        )
    }

    /**
     * Android App 啟動時的自動檢查更新
     * 僅在原生 Android 執行，並於網路異常時靜默處理，不打擾正常記帳體驗
     */
    async checkOnStartup() {
        if (!this.isAndroidNative()) return

        try {
            await this.checkForUpdates({ isStartup: true })
        } catch (error) {
            console.warn('[AppUpdateService] 啟動自動檢查更新失敗 (靜默忽略):', error)
        }
    }

    /**
     * 檢查更新主邏輯 (支援啟動自動檢查與設定頁手動檢查)
     *
     * @param {Object} options
     * @param {boolean} [options.isStartup=false] - 是否為啟動時背景檢查
     * @param {boolean} [options.isManual=false] - 是否為使用者手動點擊檢查
     */
    async checkForUpdates({ isStartup = false, isManual = false } = {}) {
        if (this.isChecking) return
        this.isChecking = true

        if (isManual) {
            showToast('正在檢查更新...')
        }

        try {
            const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
                headers: { Accept: 'application/vnd.github+json' },
                cache: 'no-store',
            })

            if (!response.ok) {
                throw new Error(`GitHub API 回應代碼 ${response.status}`)
            }

            const release = await response.json()
            const currentVersion =
                typeof __APP_VERSION__ !== 'undefined'
                    ? __APP_VERSION__
                    : '0.0.0'

            const hasNewer = isVersionNewer(release.tag_name, currentVersion)

            if (!hasNewer) {
                if (isManual) {
                    showToast('已是最新版本！', 'success')
                }
                return { hasUpdate: false, release, currentVersion }
            }

            const latestVersion = String(release.tag_name || '').replace(
                /^v/i,
                ''
            )

            // 若為啟動自動檢查，且使用者在當前工作階段已點選過「稍後提醒」，則不重複彈窗
            if (isStartup) {
                const dismissedVersion = sessionStorage.getItem(
                    `dismissed_update_${latestVersion}`
                )
                if (dismissedVersion === 'true') {
                    return { hasUpdate: true, release, currentVersion, dismissed: true }
                }
            }

            // 彈出更新通知對話框
            this.showUpdatePromptModal(release, currentVersion)
            return { hasUpdate: true, release, currentVersion }
        } catch (error) {
            console.warn('[AppUpdateService] 檢查更新異常:', error)
            if (isManual) {
                showToast('無法連線至 GitHub 檢查更新，請稍後再試', 'error')
            }
            throw error
        } finally {
            this.isChecking = false
        }
    }

    /**
     * 顯示「發現新版本」通知彈窗
     *
     * @param {Object} release - GitHub Release 資料物件
     * @param {string} currentVersion - 目前應用程式版本
     */
    showUpdatePromptModal(release, currentVersion) {
        this.closeActiveModal()

        const latestVersion = String(release.tag_name || '').replace(/^v/i, '')
        const releaseBody = release.body || '包含多項穩定性修正與功能改進。'

        // 簡易過濾 Markdown 特殊語法，保持閱讀整潔
        const cleanNotes = escapeHTML(
            releaseBody
                .replace(/^#+\s+/gm, '')
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .trim()
        )

        const modal = document.createElement('div')
        modal.id = 'app-update-prompt-modal'
        modal.className =
            'fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-[2px] animate-fade-in'

        modal.innerHTML = `
            <div class="bg-wabi-bg rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl border border-wabi-border/60 transition-all">
                <div class="size-14 bg-wabi-primary/10 text-wabi-primary rounded-2xl flex items-center justify-center mx-auto mb-4 ring-8 ring-wabi-primary/5">
                    <i class="fa-solid fa-cloud-arrow-down text-2xl"></i>
                </div>
                <h3 class="text-xl font-bold text-wabi-text-primary mb-1">發現新版本！</h3>
                
                <div class="flex items-center justify-center gap-2 mb-4">
                    <span class="text-xs px-2.5 py-0.5 rounded-full bg-wabi-surface text-wabi-text-secondary border border-wabi-border">v${currentVersion}</span>
                    <i class="fa-solid fa-arrow-right text-[10px] text-wabi-text-secondary"></i>
                    <span class="text-xs px-2.5 py-0.5 rounded-full bg-wabi-primary/15 text-wabi-primary font-bold">v${latestVersion}</span>
                </div>

                <div class="text-left text-xs text-wabi-text-secondary bg-wabi-surface/90 rounded-xl p-3.5 max-h-40 overflow-y-auto mb-5 border border-wabi-border/50 whitespace-pre-wrap leading-relaxed">
${cleanNotes}
                </div>

                <div class="space-y-2">
                    <button id="update-confirm-btn" class="w-full bg-wabi-primary hover:bg-wabi-primary-hover text-wabi-surface font-bold py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]">
                        <i class="fa-solid fa-download"></i>
                        <span>立即更新</span>
                    </button>
                    <button id="update-later-btn" class="w-full py-2.5 text-xs text-wabi-text-secondary hover:text-wabi-text-primary transition-colors cursor-pointer">
                        稍後提醒
                    </button>
                </div>
            </div>
        `

        document.body.appendChild(modal)
        this.activeModal = modal

        const laterBtn = modal.querySelector('#update-later-btn')
        laterBtn.addEventListener('click', () => {
            sessionStorage.setItem(`dismissed_update_${latestVersion}`, 'true')
            this.closeActiveModal()
        })

        const confirmBtn = modal.querySelector('#update-confirm-btn')
        confirmBtn.addEventListener('click', async () => {
            if (confirmBtn.disabled) return
            confirmBtn.disabled = true
            confirmBtn.classList.add('opacity-80', 'cursor-not-allowed')
            confirmBtn.innerHTML = `
                <i class="fa-solid fa-circle-notch fa-spin"></i>
                <span>正在準備更新...</span>
            `

            try {
                await this.startUpdateProcess(release, latestVersion)
            } catch (err) {
                console.error('[AppUpdateService] 啟動更新失敗:', err)
                showToast('啟動更新失敗：' + (err.message || '請稍後再試'), 'error')
                confirmBtn.disabled = false
                confirmBtn.classList.remove('opacity-80', 'cursor-not-allowed')
                confirmBtn.innerHTML = `
                    <i class="fa-solid fa-download"></i>
                    <span>立即更新</span>
                `
            }
        })
    }

    /**
     * 啟動下載與安裝流程
     *
     * @param {Object} release
     * @param {string} latestVersion
     */
    async startUpdateProcess(release, latestVersion) {
        const isNative = this.isAndroidNative()
        const plugin = getAppUpdatePlugin()

        let supportedAbis = []
        let isPluginOperational = false

        if (plugin) {
            try {
                if (typeof plugin.getAppInfo === 'function') {
                    const info = await plugin.getAppInfo()
                    supportedAbis = info?.supportedAbis || []
                    isPluginOperational = true
                }
            } catch (e) {
                console.warn('[AppUpdateService] 原生外掛 getAppInfo 不可用 (可能為升級前舊版 APK):', e)
            }
        }

        const selectedAsset = selectApkAsset(release.assets, supportedAbis)
        const targetUrl =
            selectedAsset?.browser_download_url ||
            release.html_url ||
            GITHUB_LATEST_RELEASE_URL

        // 若非 Android 原生環境、找不到資產，或原生插件未就緒（例如舊版升級上來）
        // 自動使用系統瀏覽器打開 APK 下載網址，絕不卡死！
        if (!isNative || !plugin || !isPluginOperational || !selectedAsset) {
            showToast('正在開啟瀏覽器下載更新檔案...', 'info')
            await openExternalUrl(targetUrl)
            this.closeActiveModal()
            return
        }

        // 原生外掛可用：切換為在線下載進度彈窗
        this.showDownloadProgressModal(latestVersion, selectedAsset.browser_download_url, plugin)
    }

    /**
     * 顯示下載進度彈窗並執行 APK 下載與安裝
     *
     * @param {string} latestVersion
     * @param {string} downloadUrl
     * @param {Object} plugin
     */
    showDownloadProgressModal(latestVersion, downloadUrl, plugin) {
        this.closeActiveModal()

        const modal = document.createElement('div')
        modal.id = 'app-update-progress-modal'
        modal.className =
            'fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4 backdrop-blur-[2px] animate-fade-in'

        modal.innerHTML = `
            <div class="bg-wabi-bg rounded-2xl max-w-sm w-full p-6 text-center shadow-2xl border border-wabi-border/60">
                <div id="progress-icon-container" class="size-14 bg-wabi-primary/10 text-wabi-primary rounded-2xl flex items-center justify-center mx-auto mb-4 ring-8 ring-wabi-primary/5">
                    <i class="fa-solid fa-arrow-down-long text-2xl animate-bounce"></i>
                </div>
                <h3 id="progress-title" class="text-xl font-bold text-wabi-text-primary mb-1">正在下載更新...</h3>
                <p id="progress-version" class="text-xs text-wabi-text-secondary mb-4">版本 v${latestVersion}</p>

                <!-- 進度條 -->
                <div class="w-full bg-wabi-surface rounded-full h-3.5 p-0.5 border border-wabi-border/60 mb-2 overflow-hidden">
                    <div id="update-progress-bar" class="bg-wabi-primary h-full rounded-full transition-all duration-150" style="width: 0%"></div>
                </div>

                <!-- 進度數字說明 -->
                <div class="flex justify-between items-center text-xs text-wabi-text-secondary mb-5 px-1">
                    <span id="progress-percent-text">0%</span>
                    <span id="progress-bytes-text">準備下載中...</span>
                </div>

                <!-- 動態按鈕或提示區塊 -->
                <div id="progress-action-container">
                    <button id="cancel-download-btn" class="w-full py-2.5 text-xs text-wabi-text-secondary hover:text-wabi-expense transition-colors cursor-pointer border border-wabi-border rounded-xl">
                        取消下載
                    </button>
                </div>
            </div>
        `

        document.body.appendChild(modal)
        this.activeModal = modal

        const progressBar = modal.querySelector('#update-progress-bar')
        const percentText = modal.querySelector('#progress-percent-text')
        const bytesText = modal.querySelector('#progress-bytes-text')
        const progressTitle = modal.querySelector('#progress-title')
        const actionContainer = modal.querySelector('#progress-action-container')
        const iconContainer = modal.querySelector('#progress-icon-container')
        const cancelBtn = modal.querySelector('#cancel-download-btn')

        let isCancelled = false

        cancelBtn?.addEventListener('click', async () => {
            isCancelled = true
            try {
                if (typeof plugin.cancelDownload === 'function') {
                    await plugin.cancelDownload()
                }
            } catch (_) {}
            this.closeActiveModal()
            showToast('已取消更新下載', 'info')
        })

        // 監聽原生下載進度事件
        let progressListenerPromise = null
        if (typeof plugin.addListener === 'function') {
            try {
                progressListenerPromise = plugin.addListener(
                    'downloadProgress',
                    progressData => {
                        if (isCancelled || !progressData) return
                        const percent = progressData.progress >= 0 ? progressData.progress : 0
                        progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`
                        percentText.textContent = `${percent}%`

                        if (progressData.totalBytes > 0) {
                            bytesText.textContent = `${formatBytes(progressData.downloadedBytes)} / ${formatBytes(progressData.totalBytes)}`
                        } else if (progressData.downloadedBytes > 0) {
                            bytesText.textContent = formatBytes(progressData.downloadedBytes)
                        }
                    }
                )
            } catch (err) {
                console.warn('[AppUpdateService] 註冊 downloadProgress 監聽器失敗:', err)
            }
        }

        // 開始呼叫原生下載並執行安裝
        plugin
            .downloadAndInstall({
                url: downloadUrl,
                version: latestVersion,
            })
            .then(async result => {
                if (isCancelled) return

                // 下載完成，更新 UI
                progressBar.style.width = '100%'
                percentText.textContent = '100%'
                progressTitle.textContent = '下載完成'
                iconContainer.className =
                    'size-14 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-8 ring-emerald-500/5'
                iconContainer.innerHTML =
                    '<i class="fa-solid fa-circle-check text-2xl"></i>'

                // 檢查是否具有未知來源安裝權限
                let canInstall = true
                if (typeof plugin.canRequestPackageInstalls === 'function') {
                    try {
                        const perm = await plugin.canRequestPackageInstalls()
                        canInstall = Boolean(perm?.value)
                    } catch (_) {}
                }

                if (!canInstall) {
                    bytesText.textContent = '需要授予安裝權限以完成更新'
                    actionContainer.innerHTML = `
                        <div class="space-y-2">
                            <p class="text-xs text-wabi-expense mb-2">系統尚未開啟「允許安裝未知應用」權限，請點擊下方開啟設定。</p>
                            <button id="open-permission-btn" class="w-full bg-wabi-primary hover:bg-wabi-primary-hover text-wabi-surface font-bold py-3 rounded-xl transition-all text-xs cursor-pointer">
                                前往開啟安裝權限
                            </button>
                            <button id="retry-install-btn" class="w-full bg-wabi-surface border border-wabi-border hover:bg-wabi-bg text-wabi-text-primary py-2.5 rounded-xl transition-all text-xs cursor-pointer">
                                重新觸發安裝
                            </button>
                        </div>
                    `
                    actionContainer
                        .querySelector('#open-permission-btn')
                        ?.addEventListener('click', async () => {
                            try {
                                await plugin.openInstallPermissionSettings()
                            } catch (e) {
                                showToast('無法開啟設定頁面: ' + e.message, 'error')
                            }
                        })
                    actionContainer
                        .querySelector('#retry-install-btn')
                        ?.addEventListener('click', async () => {
                            if (result?.filePath) {
                                try {
                                    await plugin.installApkFile({ filePath: result.filePath })
                                } catch (e) {
                                    showToast('啟動安裝失敗: ' + e.message, 'error')
                                }
                            }
                        })
                } else {
                    bytesText.textContent = '正在啟動系統覆蓋安裝程序...'
                    actionContainer.innerHTML = `
                        <div class="space-y-2">
                            <p class="text-xs text-wabi-text-secondary mb-2">請在系統提示框中點選「安裝」或「更新」即可保留所有資料完成升級。</p>
                            <button id="manual-trigger-install-btn" class="w-full bg-wabi-primary hover:bg-wabi-primary-hover text-wabi-surface font-bold py-3 rounded-xl transition-all text-xs cursor-pointer">
                                若未跳出請點此手動安裝
                            </button>
                            <button id="close-update-modal-btn" class="w-full py-2 text-xs text-wabi-text-secondary hover:text-wabi-text-primary transition-colors cursor-pointer">
                                關閉
                            </button>
                        </div>
                    `
                    actionContainer
                        .querySelector('#manual-trigger-install-btn')
                        ?.addEventListener('click', async () => {
                            if (result?.filePath) {
                                try {
                                    await plugin.installApkFile({ filePath: result.filePath })
                                } catch (e) {
                                    showToast('手動安裝失敗: ' + e.message, 'error')
                                }
                            }
                        })
                    actionContainer
                        .querySelector('#close-update-modal-btn')
                        ?.addEventListener('click', () => {
                            this.closeActiveModal()
                        })
                }
            })
            .catch(error => {
                if (isCancelled) return
                console.error('[AppUpdateService] 下載或安裝失敗:', error)
                progressTitle.textContent = '更新失敗'
                iconContainer.className =
                    'size-14 bg-red-500/10 text-wabi-expense rounded-2xl flex items-center justify-center mx-auto mb-4 ring-8 ring-red-500/5'
                iconContainer.innerHTML =
                    '<i class="fa-solid fa-triangle-exclamation text-2xl"></i>'
                bytesText.textContent = error.message || '下載過程中發生錯誤'

                actionContainer.innerHTML = `
                    <div class="space-y-2">
                        <button id="retry-download-btn" class="w-full bg-wabi-primary hover:bg-wabi-primary-hover text-wabi-surface font-bold py-3 rounded-xl transition-all text-xs cursor-pointer">
                            重新下載
                        </button>
                        <button id="browser-download-btn" class="w-full bg-wabi-surface border border-wabi-border hover:bg-wabi-bg text-wabi-text-primary py-2.5 rounded-xl transition-all text-xs cursor-pointer">
                            由瀏覽器下載
                        </button>
                        <button id="close-error-modal-btn" class="w-full py-2 text-xs text-wabi-text-secondary hover:text-wabi-text-primary transition-colors cursor-pointer">
                            關閉
                        </button>
                    </div>
                `

                actionContainer
                    .querySelector('#retry-download-btn')
                    ?.addEventListener('click', () => {
                        this.showDownloadProgressModal(latestVersion, downloadUrl, plugin)
                    })
                actionContainer
                    .querySelector('#browser-download-btn')
                    ?.addEventListener('click', async () => {
                        await openExternalUrl(downloadUrl)
                        this.closeActiveModal()
                    })
                actionContainer
                    .querySelector('#close-error-modal-btn')
                    ?.addEventListener('click', () => {
                        this.closeActiveModal()
                    })
            })
            .finally(async () => {
                if (progressListenerPromise) {
                    try {
                        const handle = await progressListenerPromise
                        if (handle?.remove) handle.remove()
                    } catch (_) {}
                }
            })
    }

    /**
     * 關閉當前開啟的更新彈窗
     */
    closeActiveModal() {
        if (this.activeModal) {
            try {
                this.activeModal.remove()
            } catch (_) {}
            this.activeModal = null
        }
    }
}
