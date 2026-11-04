/**
 * Easy Accounting Sync & Backup Server — Standalone (Node.js)
 *
 * 使用 Node.js 原生 http 模組，提供 REST API 介面供前端存取 PostgreSQL 資料庫。
 *
 * 環境變數：
 *   DATABASE_URL     — PostgreSQL 連線字串 (預設已包含 Prisma 連線字串)
 *   ALLOWED_ORIGINS  — 逗號分隔的允許 CORS origin（預設 *）
 *   PORT             — 監聽埠號（預設 8787）
 */

import { createServer } from 'node:http'
import { handleRequest } from './index.js'
import { DEFAULT_DATABASE_URL, ensureTables } from './db.js'

const PORT = parseInt(process.env.PORT || '8787', 10)

const env = {
    DATABASE_URL: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*',
}

/**
 * 將 Node.js HTTP request 轉換為 Web API Request 物件
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Request>}
 */
async function toWebRequest(req) {
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers.host || `localhost:${PORT}`
    const url = `${protocol}://${host}${req.url}`

    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
        if (value)
            headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    let body = null

    if (hasBody) {
        const chunks = []
        for await (const chunk of req) {
            chunks.push(chunk)
        }
        body = Buffer.concat(chunks)
    }

    return new Request(url, {
        method: req.method,
        headers,
        body,
    })
}

// ──────────────────────────────────────────────
// HTTP Server
// ──────────────────────────────────────────────

const server = createServer(async (req, res) => {
    try {
        const webRequest = await toWebRequest(req)
        const webResponse = await handleRequest(webRequest, env)

        // Convert Web Response → Node.js response
        res.writeHead(
            webResponse.status,
            Object.fromEntries(webResponse.headers.entries())
        )
        const responseBody = await webResponse.text()
        res.end(responseBody)
    } catch (err) {
        console.error('Server error:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Internal server error' }))
    }
})

ensureTables()
    .then(() => {
        server.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════╗
║   Easy Accounting PostgreSQL Backup Server   ║
║   Listening on http://localhost:${PORT}        ║
╚══════════════════════════════════════════════╝
`)
        })
    })
    .catch(err => {
        console.error('Failed to initialize database tables:', err)
        process.exit(1)
    })
