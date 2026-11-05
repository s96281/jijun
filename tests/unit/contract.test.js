// contract.test.js — 頁面 → Manager/Services 契約測試
// #U08 導覽功能 + 契約保護
// 目的：驗證每個頁面 (pages/*.js) 中 this.app.<svc>.<method>( 調用的方法
//       真實存在于對應 service 類的 prototype 上，避免方法名/接縫被意外破壞。
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

import DataService from '../../src/js/dataService.js'
import { CategoryManager } from '../../src/js/categoryManager.js'
import { ChangelogManager } from '../../src/js/changelog.js'
import { BudgetManager } from '../../src/js/budgetManager.js'
import { QuickSelectManager } from '../../src/js/quickSelectManager.js'
import { LedgerManager } from '../../src/js/ledgerManager.js'
import { PluginManager } from '../../src/js/pluginManager.js'
import { SyncService } from '../../src/js/syncService.js'
import { NotificationService } from '../../src/js/notificationService.js'
import { ThemeManager } from '../../src/js/themeManager.js'
import { GuideManager } from '../../src/js/tourManager.js'
import { AppUpdateService } from '../../src/js/appUpdateService.js'
import { EasyAccountingApp } from '../../src/js/main.js'

// svc 名 -> 類 (與 main.js 的 this.app.xxx = new Xxx 綁定一致)
const serviceClasses = {
    dataService: DataService,
    categoryManager: CategoryManager,
    changelogManager: ChangelogManager,
    budgetManager: BudgetManager,
    quickSelectManager: QuickSelectManager,
    ledgerManager: LedgerManager,
    pluginManager: PluginManager,
    syncService: SyncService,
    notificationService: NotificationService,
    themeManager: ThemeManager,
    guideManager: GuideManager,
    appUpdateService: AppUpdateService,
}

// 非 service 的 app 屬性（DOM 容器 / 原生 PWA 對象等），不參與契約檢查
const NON_SERVICE = new Set(['appContainer', 'deferredInstallPrompt'])

// 用 process.cwd() 定位 pages 目錄（vitest 運行於項目根部）
const pagesDir = join(process.cwd(), 'src', 'js', 'pages')
const files = readdirSync(pagesDir).filter(f => f.endsWith('.js'))

// 移除行內/塊註釋，避免註釋裏的舊調用被誤抓（假陽性）
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '') // 多行 /* */ 塊註釋
        .replace(/\/\/.*$/gm, '') // 單行 // 註釋
}

// 從清理後的源碼提取局部變量別名：const xxx = this.app.xxx
function extractAliases(src) {
    const aliases = {}
    const re =
        /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*this\.app\.([a-zA-Z_]+)(?![\w$.?])/g
    let m
    while ((m = re.exec(src))) {
        const [alias, svc] = [m[1], m[2]]
        if (Object.prototype.hasOwnProperty.call(serviceClasses, svc)) {
            aliases[alias] = svc
        }
    }
    const re2 =
        /this\.([a-zA-Z_$][\w$]*)\s*=\s*(?:app\.|this\.app\.)?([a-zA-Z_]+)(?![\w$.?])/g
    while ((m = re2.exec(src))) {
        const [alias, svc] = [m[1], m[2]]
        if (
            Object.prototype.hasOwnProperty.call(serviceClasses, svc) &&
            !aliases[alias]
        ) {
            aliases[alias] = svc
        }
    }
    return aliases
}

// 提取每個頁面文件的 this.app.<svc>.<method>( 調用
function extractCalls(src) {
    const calls = new Set()
    const aliases = extractAliases(src)
    const re =
        /this\.app\??\.\s*([a-zA-Z_$][\w$]*)\s*\??\.\s*([a-zA-Z_$][\w$]*)\s*\(/g
    let m
    while ((m = re.exec(src))) {
        if (NON_SERVICE.has(m[1])) continue
        calls.add({ svc: m[1], method: m[2] })
    }
    for (const [alias, svc] of Object.entries(aliases)) {
        const escapedAlias = alias.replace(/\$/g, '\\$')
        const reAl = new RegExp(
            `${escapedAlias}\\s*\\.\\s*([a-zA-Z_$][\\w$]*)\\s*\\(`,
            'g'
        )
        while ((m = reAl.exec(src))) {
            calls.add({ svc, method: m[1] })
        }
    }
    return calls
}

// 提取每個頁面文件的 this.app.<method>( 直接方法調用
function extractAppMethods(src) {
    const methods = new Set()
    const re = /this\.app\??\.\s*([a-zA-Z_$][\w$]*)\s*\(/g
    let m
    while ((m = re.exec(src))) {
        const name = m[1]
        if (Object.prototype.hasOwnProperty.call(serviceClasses, name)) continue
        if (NON_SERVICE.has(name)) continue
        methods.add(name)
    }
    return methods
}

describe('頁面 → Service 契約測試', () => {
    let totalCalls = 0
    for (const file of files) {
        const rawSrc = readFileSync(join(pagesDir, file), 'utf-8')
        const src = stripComments(rawSrc)
        const calls = extractCalls(src)
        const appMethods = extractAppMethods(src)
        totalCalls += calls.size + appMethods.size
        if (calls.size === 0 && appMethods.size === 0) continue

        describe(`pages/${file}`, () => {
            for (const { svc, method } of calls) {
                const Klass = serviceClasses[svc]
                it(`調用的 this.app.${svc}.${method}() 應存在`, () => {
                    expect(
                        Klass,
                        `頁面引用了未知 service '${svc}' (main.js 未綁定)`
                    ).toBeDefined()
                    expect(
                        typeof Klass.prototype[method],
                        `${svc}.${method} 在 ${Klass?.name || svc} 類上不存在`
                    ).toBe('function')
                })
            }
            for (const method of appMethods) {
                it(`調用的 this.app.${method}() 應存在於 EasyAccountingApp`, () => {
                    expect(
                        typeof EasyAccountingApp.prototype[method],
                        `app.${method} 在 EasyAccountingApp 類上不存在`
                    ).toBe('function')
                })
            }
        })
    }
    it('契約測試應抓到實際調用點', () => {
        expect(totalCalls).toBeGreaterThan(15)
    })
})
