export class PrivacyPage {
    constructor(app) {
        this.app = app
    }

    async render() {
        this.app.appContainer.innerHTML = `
            <div class="page active p-4 pb-24 md:pb-8 max-w-3xl mx-auto">
                <div class="flex items-center justify-between mb-6">
                    <a href="#settings" class="text-wabi-text-secondary hover:text-wabi-primary">
                        <i class="fa-solid fa-chevron-left text-xl"></i>
                    </a>
                    <h1 class="text-xl font-bold text-wabi-primary">隱私權政策</h1>
                    <div class="w-6"></div>
                </div>
                <div class="bg-wabi-surface rounded-xl shadow-sm border border-wabi-border p-6 mb-8 text-wabi-text-primary space-y-4 leading-relaxed">
                    <p>感謝您使用「輕鬆記帳 2.0」（以下簡稱本應用程式）。我們非常重視您的隱私權，請閱讀以下政策以了解我們如何處理您的資料：</p>
                    
                    <h2 class="text-lg font-bold text-wabi-primary mt-6">1. 本機資料儲存</h2>
                    <p>本應用程式採用漸進式網頁應用程式 (PWA) 技術，您的所有新增的記帳與帳戶資料皆直接儲存於您個人裝置的瀏覽器資料庫 (IndexedDB) 中。開發者與任何第三方伺服器均無法主動獲取、查看或收集您的個人記帳資料。</p>
                    
                    <h2 class="text-lg font-bold text-wabi-primary mt-6">2. 雲端備份&同步功能</h2>
                    <p>若您選擇啟用「雲端備份&同步」功能，本應用程式將透過 Google Identity Services 要求授權，將資料備份至您個人的 Google Drive 隱藏應用程式資料夾中。備份資料僅供您跨裝置同步與還原使用，開發者伺服器不經手亦無法存取您的 Google Drive 資料。</p>
                    
                    <h2 class="text-lg font-bold text-wabi-primary mt-6">3. 資料刪除</h2>
                    <p>由於資料主要儲存於您的本機裝置，若您希望刪除所有記帳資料，您可以：<br>
                    (1) 直接透過瀏覽器設定清除網站資料（Cache、IndexedDB）<br>
                    (2) 若您曾使用雲端備份&同步功能，您可以在 Google 帳號的「安全性 > 管理第三方程式的存取權」中移除本應用程式的授權，並刪除 Google Drive 上的應用程式資料。</p>

                    <h2 class="text-lg font-bold text-wabi-primary mt-6">4. 政策更新</h2>
                    <p>我們保留隨時修改本隱私權政策的權利，更新後將不會另行發布通知。您繼續使用本應用程式即表示您同意修改後的隱私權政策。</p>
                </div>
            </div>
        `
    }
}
