/**
 * Easy Accounting Sync & Backup Server — PostgreSQL Backend
 *
 * 支援功能：
 * 1. 使用者自訂帳號密碼註冊與登入驗證 (PBKDF2 加鹽加密)
 * 2. 狀態化 Token Session 管理
 * 3. 雲端資料庫備份儲存 (JSONB)、清單檢視、按需還原與刪除
 *
 * 環境變數 (Vars / Secrets):
 *   DATABASE_URL    — PostgreSQL 連線字串 (支援 Prisma / Supabase / Neon / 自架)
 *   ALLOWED_ORIGINS — 逗號分隔允許的 CORS origin 列表（預設 *）
 *   PORT            — 監聽埠號（預設 8787）
 */

import {
    registerUser,
    loginUser,
    getUserFromToken,
    refreshSession,
    logoutUser,
    saveUserBackup,
    listUserBackups,
    getUserBackup,
    deleteUserBackup,
    ensureTables,
    createRequestPool,
} from './db.js'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function jsonResponse(body, status, corsHeaders) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...Object.fromEntries(corsHeaders.entries()),
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
        },
    })
}

function getCorsHeaders(request, allowedOriginsStr) {
    const origin = request?.headers?.get('Origin') || ''
    const allowedOrigins = (allowedOriginsStr || '*')
        .split(',')
        .map(o => o.trim())
    const headers = new Headers()

    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        headers.set('Access-Control-Allow-Origin', origin || '*')
    }

    headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With'
    )
    headers.set('Access-Control-Max-Age', '86400')
    return headers
}

function getBearerToken(request) {
    const authHeader = request.headers.get('Authorization') || ''
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    return match ? match[1].trim() : null
}

async function requireAuth(request, corsHeaders, pool) {
    const token = getBearerToken(request)
    if (!token) {
        return { errorResponse: jsonResponse({ error: '請先登入帳號' }, 401, corsHeaders) }
    }
    const user = await getUserFromToken(token, pool)
    if (!user) {
        return { errorResponse: jsonResponse({ error: '登入權限已過期，請重新登入' }, 401, corsHeaders) }
    }
    return { user, token }
}

// ──────────────────────────────────────────────
// Main Request Handler
// ──────────────────────────────────────────────

export async function handleRequest(request, env = {}, ctx = null) {
    const corsHeaders = getCorsHeaders(request, env.ALLOWED_ORIGINS)
    const url = new URL(request.url)
    const { pathname } = url
    const method = request.method.toUpperCase()

    // CORS preflight
    if (method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }

    const pool = createRequestPool(env.DATABASE_URL)

    try {
        // ── 註冊端點 ──
        if (method === 'POST' && pathname === '/api/auth/register') {
            const body = await request.json().catch(() => ({}))
            const { username, password } = body
            try {
                const res = await registerUser(username, password, pool)
                return jsonResponse(res, 200, corsHeaders)
            } catch (err) {
                return jsonResponse({ error: err.message }, 400, corsHeaders)
            }
        }

        // ── 登入端點 ──
        if (method === 'POST' && pathname === '/api/auth/login') {
            const body = await request.json().catch(() => ({}))
            const { username, password } = body
            try {
                const res = await loginUser(username, password, pool)
                return jsonResponse(res, 200, corsHeaders)
            } catch (err) {
                return jsonResponse({ error: err.message }, 401, corsHeaders)
            }
        }

        // ── 登出端點 ──
        if (method === 'POST' && pathname === '/api/auth/logout') {
            const token = getBearerToken(request)
            if (token) {
                await logoutUser(token, pool)
            }
            return jsonResponse({ success: true }, 200, corsHeaders)
        }

        // ── 刷新 Session 端點 ──
        if (method === 'POST' && pathname === '/api/auth/refresh') {
            let token = getBearerToken(request)
            if (!token) {
                const body = await request.json().catch(() => ({}))
                token = body.token || body.refresh_token
            }
            if (!token) {
                return jsonResponse({ error: '缺少 Token' }, 401, corsHeaders)
            }
            const refreshed = await refreshSession(token, pool)
            if (!refreshed) {
                return jsonResponse({ error: 'Session 已失效，請重新登入' }, 401, corsHeaders)
            }
            return jsonResponse(refreshed, 200, corsHeaders)
        }

        // ── 取得當前使用者資訊 ──
        if (method === 'GET' && pathname === '/api/auth/me') {
            const { user, errorResponse } = await requireAuth(request, corsHeaders, pool)
            if (errorResponse) return errorResponse
            return jsonResponse({ user }, 200, corsHeaders)
        }

        // ── 建立/上傳備份 ──
        if (method === 'POST' && pathname === '/api/backup') {
            const { user, errorResponse } = await requireAuth(request, corsHeaders, pool)
            if (errorResponse) return errorResponse

            const body = await request.json().catch(() => ({}))
            const { fileName, data, deviceId } = body
            if (!data) {
                return jsonResponse({ error: '缺少備份資料 (data)' }, 400, corsHeaders)
            }

            const cleanFileName =
                fileName || `backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`

            const saved = await saveUserBackup(user.id, cleanFileName, data, deviceId, pool)
            return jsonResponse({ success: true, backup: saved }, 200, corsHeaders)
        }

        // ── 列出所有備份清單 ──
        if (method === 'GET' && pathname === '/api/backup') {
            const { user, errorResponse } = await requireAuth(request, corsHeaders, pool)
            if (errorResponse) return errorResponse

            const backups = await listUserBackups(user.id, pool)
            return jsonResponse({ backups }, 200, corsHeaders)
        }

        // ── 取得單一備份內容 (還原) ──
        const singleBackupMatch = pathname.match(/^\/api\/backup\/(\d+)$/)
        if (method === 'GET' && singleBackupMatch) {
            const { user, errorResponse } = await requireAuth(request, corsHeaders, pool)
            if (errorResponse) return errorResponse

            const backupId = parseInt(singleBackupMatch[1], 10)
            const backup = await getUserBackup(backupId, user.id, pool)
            if (!backup) {
                return jsonResponse({ error: '找不到指定的備份檔案' }, 404, corsHeaders)
            }
            return jsonResponse({ backup }, 200, corsHeaders)
        }

        // ── 刪除單一備份 ──
        if (method === 'DELETE' && singleBackupMatch) {
            const { user, errorResponse } = await requireAuth(request, corsHeaders, pool)
            if (errorResponse) return errorResponse

            const backupId = parseInt(singleBackupMatch[1], 10)
            const ok = await deleteUserBackup(backupId, user.id, pool)
            if (!ok) {
                return jsonResponse({ error: '備份不存在或已被刪除' }, 404, corsHeaders)
            }
            return jsonResponse({ success: true }, 200, corsHeaders)
        }

        // ── 健康檢查 ──
        if (method === 'GET' && pathname === '/api/health') {
            try {
                await ensureTables(pool, true)
                return jsonResponse(
                    {
                        status: 'ok',
                        service: 'easy-accounting-postgres-sync',
                        database: 'connected',
                        timestamp: new Date().toISOString(),
                    },
                    200,
                    corsHeaders
                )
            } catch (dbErr) {
                return jsonResponse(
                    {
                        status: 'degraded',
                        service: 'easy-accounting-postgres-sync',
                        database: 'error',
                        error: dbErr.message,
                    },
                    500,
                    corsHeaders
                )
            }
        }

        // 404 fallback
        return jsonResponse({ error: 'Endpoint not found' }, 404, corsHeaders)
    } catch (err) {
        console.error('[API Server Error]:', err)
        return jsonResponse(
            { error: '伺服器內部錯誤', message: err.message },
            500,
            corsHeaders
        )
    } finally {
        // 在傳回 Response 之前必須 await 連線完全關閉釋放
        // 否則 isolate 凍結會留下無法關閉的殭屍連線，導致 Prisma 連線池耗盡 (503)
        await pool.end().catch(err => {
            console.warn('[DB] pool.end() error:', err?.message)
        })
    }
}

export default {
    async fetch(request, env, ctx) {
        return handleRequest(request, env, ctx)
    },
}
