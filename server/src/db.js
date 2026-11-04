import pg from 'pg'
import crypto from 'node:crypto'

const { Pool } = pg

export const DEFAULT_DATABASE_URL =
    'postgres://4295e222564559a295613a2836d95e3aae99ca497af04086d4c062240d1b1759:sk_d36nxkeMXNoz5fNG3Ltc4@pooled.db.prisma.io:5432/postgres?sslmode=require'

let poolInstance = null

export function createRequestPool(connectionString) {
    const connStr =
        connectionString ||
        process.env.DATABASE_URL ||
        DEFAULT_DATABASE_URL
    return new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        max: 1, // 每個請求獨立連線，避免 Serverless 凍結殘留死連線
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 1000,
    })
}

export function getPool(connectionString) {
    return createRequestPool(connectionString)
}

export async function safeQuery(pool, text, params = []) {
    let lastError = null
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            return await pool.query(text, params)
        } catch (err) {
            lastError = err
            const msg = String(err?.message || '').toLowerCase()
            const isRetryable =
                msg.includes('upstream') ||
                msg.includes('connection') ||
                msg.includes('timeout') ||
                msg.includes('socket')
            if (attempt === 0 && isRetryable) {
                console.warn('[DB] Retrying query due to upstream connection glitch:', err.message)
                await new Promise(r => setTimeout(r, 600))
                continue
            }
            throw err
        }
    }
    throw lastError
}

let tablesEnsured = false

export async function ensureTables(pool = getPool(), force = false) {
    if (tablesEnsured && !force) return
    await safeQuery(pool, `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token VARCHAR(128) PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS backups (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        data JSONB NOT NULL,
        size_bytes INTEGER DEFAULT 0,
        device_id VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_backups_user_id ON backups(user_id);
      CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);
    `)
    tablesEnsured = true
}

export function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto
        .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
        .toString('hex')
    return `${salt}:${hash}`
}

export function verifyPassword(password, stored) {
    const [salt, originalHash] = (stored || '').split(':')
    if (!salt || !originalHash) return false
    const hash = crypto
        .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
        .toString('hex')
    return crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(originalHash, 'hex')
    )
}

export async function registerUser(username, password, pool = getPool()) {
    const cleanUsername = String(username || '').trim()
    if (!cleanUsername || cleanUsername.length < 3) {
        throw new Error('使用者名稱長度至少需 3 個字元')
    }
    if (!password || String(password).length < 6) {
        throw new Error('密碼長度至少需 6 個字元')
    }

    await ensureTables(pool)

    const existing = await safeQuery(
        pool,
        'SELECT id FROM users WHERE username = $1 LIMIT 1;',
        [cleanUsername]
    )
    if (existing.rows.length > 0) {
        throw new Error('該使用者名稱已被註冊')
    }

    const passwordHash = hashPassword(password)
    const insertRes = await safeQuery(
        pool,
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at;',
        [cleanUsername, passwordHash]
    )
    const user = insertRes.rows[0]

    const token = crypto.randomBytes(32).toString('hex')
    await safeQuery(
        pool,
        "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days');",
        [token, user.id]
    )

    return { token, user: { id: user.id, username: user.username } }
}

export async function loginUser(username, password, pool = getPool()) {
    const cleanUsername = String(username || '').trim()
    if (!cleanUsername || !password) {
        throw new Error('請輸入使用者名稱與密碼')
    }

    await ensureTables(pool)

    const userRes = await safeQuery(
        pool,
        'SELECT id, username, password_hash FROM users WHERE username = $1 LIMIT 1;',
        [cleanUsername]
    )
    if (userRes.rows.length === 0) {
        throw new Error('使用者名稱或密碼錯誤')
    }

    const user = userRes.rows[0]
    const valid = verifyPassword(password, user.password_hash)
    if (!valid) {
        throw new Error('使用者名稱或密碼錯誤')
    }

    const token = crypto.randomBytes(32).toString('hex')
    await safeQuery(
        pool,
        "INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days');",
        [token, user.id]
    )

    return { token, user: { id: user.id, username: user.username } }
}

export async function getUserFromToken(token, pool = getPool()) {
    if (!token) return null
    await ensureTables(pool)
    const res = await safeQuery(
        pool,
        'SELECT u.id, u.username FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = $1 AND s.expires_at > NOW();',
        [token]
    )
    return res.rows[0] || null
}

export async function logoutUser(token, pool = getPool()) {
    if (!token) return
    await safeQuery(pool, 'DELETE FROM sessions WHERE token = $1;', [token])
}

export async function refreshSession(token, pool = getPool()) {
    if (!token) return null
    await ensureTables(pool)
    const user = await getUserFromToken(token, pool)
    if (!user) return null
    await safeQuery(
        pool,
        "UPDATE sessions SET expires_at = NOW() + INTERVAL '30 days' WHERE token = $1;",
        [token]
    )
    return {
        token,
        user,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    }
}

export async function saveUserBackup(userId, fileName, data, deviceId, pool = getPool()) {
    await ensureTables(pool)
    const jsonStr = typeof data === 'string' ? data : JSON.stringify(data)
    const sizeBytes = Buffer.byteLength(jsonStr, 'utf8')

    const res = await safeQuery(
        pool,
        'INSERT INTO backups (user_id, file_name, data, size_bytes, device_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, file_name, size_bytes, created_at, device_id;',
        [userId, fileName, jsonStr, sizeBytes, deviceId || null]
    )

    // 清理舊備份，每個使用者最多保留最新的 15 個備份
    await safeQuery(
        pool,
        `DELETE FROM backups WHERE id IN (
            SELECT id FROM backups WHERE user_id = $1 ORDER BY created_at DESC OFFSET 15
        );`,
        [userId]
    )

    return res.rows[0]
}

export async function listUserBackups(userId, pool = getPool()) {
    await ensureTables(pool)
    const res = await safeQuery(
        pool,
        'SELECT id, file_name, size_bytes, created_at, device_id FROM backups WHERE user_id = $1 ORDER BY created_at DESC;',
        [userId]
    )
    return res.rows
}

export async function getUserBackup(id, userId, pool = getPool()) {
    await ensureTables(pool)
    const res = await safeQuery(
        pool,
        'SELECT id, file_name, data, size_bytes, created_at, device_id FROM backups WHERE id = $1 AND user_id = $2;',
        [id, userId]
    )
    return res.rows[0] || null
}

export async function deleteUserBackup(id, userId, pool = getPool()) {
    await ensureTables(pool)
    const res = await safeQuery(
        pool,
        'DELETE FROM backups WHERE id = $1 AND user_id = $2 RETURNING id;',
        [id, userId]
    )
    return res.rows.length > 0
}
