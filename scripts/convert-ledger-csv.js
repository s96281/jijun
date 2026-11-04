import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Configuration
const DEFAULT_INPUT_PATH = 'c:\\Users\\yojia\\Downloads\\scrcpy-win64-v5.0.1\\scrcpy-win64-v5.0.1\\ledger.csv';
const DEFAULT_OUTPUT_DOWNLOADS = 'c:\\Users\\yojia\\Downloads\\scrcpy-win64-v5.0.1\\scrcpy-win64-v5.0.1\\ledger_backup.json';
const DEFAULT_OUTPUT_LOCAL = path.resolve('ledger_backup.json');

const inputPath = process.argv[2] || DEFAULT_INPUT_PATH;

console.log(`Reading input CSV: ${inputPath}`);
const rawContent = fs.readFileSync(inputPath, 'utf8');
const lines = rawContent.trim().split(/\r?\n/);

if (lines.length < 2) {
    console.error('CSV file has no data rows.');
    process.exit(1);
}

const header = lines[0].split(',').map(s => s.trim());
console.log('Detected CSV header:', header);

// Category mapping definition
const CATEGORY_MAP = {
    expense: {
        '其他購物': {
            id: 'custom_other_shopping',
            name: '其他購物',
            icon: 'fa-solid fa-bag-shopping',
            color: 'bg-blue-500',
            isCustom: true
        },
        '美容美髮': {
            id: 'custom_beauty',
            name: '美容美髮',
            icon: 'fa-solid fa-scissors',
            color: 'bg-pink-500',
            isCustom: true
        },
        '午餐': {
            id: 'custom_lunch',
            name: '午餐',
            icon: 'fa-solid fa-bowl-food',
            color: 'bg-amber-500',
            isCustom: true
        },
        '甜點': {
            id: 'custom_dessert',
            name: '甜點',
            icon: 'fa-solid fa-cake-candles',
            color: 'bg-rose-400',
            isCustom: true
        },
        '其他交通': {
            id: 'custom_traffic',
            name: '其他交通',
            icon: 'fa-solid fa-car',
            color: 'bg-green-500',
            isCustom: true
        }
    },
    income: {
        '其他收入': {
            id: 'custom_other_income',
            name: '其他收入',
            icon: 'fa-solid fa-sack-dollar',
            color: 'bg-emerald-500',
            isCustom: true
        }
    }
};

// Account mapping definition
const ACCOUNT_MAP = {
    '購物': {
        id: 1,
        name: '購物',
        type: 'wallet',
        balance: 0,
        icon: 'fa-solid fa-bag-shopping',
        color: 'bg-blue-500',
        ledgerId: 1,
        uuid: '7a1b2c3d-0001-4000-8000-000000000001'
    },
    '生活': {
        id: 2,
        name: '生活',
        type: 'wallet',
        balance: 0,
        icon: 'fa-solid fa-house',
        color: 'bg-indigo-500',
        ledgerId: 1,
        uuid: '7a1b2c3d-0002-4000-8000-000000000002'
    },
    '收入': {
        id: 3,
        name: '收入',
        type: 'wallet',
        balance: 0,
        icon: 'fa-solid fa-wallet',
        color: 'bg-emerald-500',
        ledgerId: 1,
        uuid: '7a1b2c3d-0003-4000-8000-000000000003'
    },
    '吃喝': {
        id: 4,
        name: '吃喝',
        type: 'wallet',
        balance: 0,
        icon: 'fa-solid fa-utensils',
        color: 'bg-amber-500',
        ledgerId: 1,
        uuid: '7a1b2c3d-0004-4000-8000-000000000004'
    },
    '交通': {
        id: 5,
        name: '交通',
        type: 'wallet',
        balance: 0,
        icon: 'fa-solid fa-car',
        color: 'bg-teal-500',
        ledgerId: 1,
        uuid: '7a1b2c3d-0005-4000-8000-000000000005'
    }
};

const records = [];
let nextRecordId = 1;

for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(',');
    if (parts.length < 7) {
        console.warn(`Line ${i + 1} skipped due to invalid column count: ${line}`);
        continue;
    }

    const [date, time, rawCategory, rawAccount, rawNote, rawType, rawAmount] = parts;
    const isExpense = rawType.trim() === '支出';
    const type = isExpense ? 'expense' : 'income';
    const absAmount = Math.abs(parseFloat(rawAmount));

    const categoryDef = CATEGORY_MAP[type][rawCategory.trim()];
    const categoryId = categoryDef ? categoryDef.id : (isExpense ? 'another' : 'another');

    const accountDef = ACCOUNT_MAP[rawAccount.trim()];
    const accountId = accountDef ? accountDef.id : 1;
    const accountUuid = accountDef ? accountDef.uuid : ACCOUNT_MAP['購物'].uuid;

    // Calculate timestamp
    let timestamp = Date.now();
    try {
        const parsedTime = new Date(`${date.trim()}T${time.trim()}:00`).getTime();
        if (!isNaN(parsedTime)) {
            timestamp = parsedTime;
        }
    } catch (_) {
        // Fallback to now
    }

    records.push({
        id: nextRecordId++,
        uuid: crypto.randomUUID(),
        ledgerId: 1,
        type: type,
        category: categoryId,
        amount: absAmount,
        description: (rawNote || '').trim(),
        date: date.trim(),
        timestamp: timestamp,
        accountId: accountId,
        accountUuid: accountUuid
    });
}

console.log(`Parsed ${records.length} records successfully.`);

const exportData = {
    version: '2.3.0',
    exportDate: new Date().toISOString(),
    settings: {
        advancedAccountModeEnabled: true,
        debtManagementEnabled: false,
        groupManagementEnabled: false
    },
    activeLedgerId: 1,
    ledgers: [
        {
            id: 1,
            name: '預設帳本',
            icon: 'fa-solid fa-book',
            color: '#10b981',
            type: 'personal',
            uuid: '4f5c9e21-0a6e-4e31-8f52-47c1b1df4001'
        }
    ],
    accounts: Object.values(ACCOUNT_MAP),
    customCategories: {
        '1': {
            expense: Object.values(CATEGORY_MAP.expense),
            income: Object.values(CATEGORY_MAP.income)
        }
    },
    categoryOrder: {
        '1': {
            expense: [
                'food',
                'life',
                'traffic',
                'fun',
                'medi',
                'edu',
                'debt_repayment',
                'another',
                'custom_other_shopping',
                'custom_lunch',
                'custom_dessert',
                'custom_traffic',
                'custom_beauty'
            ],
            income: [
                'salary',
                'bonus',
                'pocket',
                'parttime',
                'invest',
                'interest',
                'debt_collection',
                'another',
                'custom_other_income'
            ]
        }
    },
    hiddenCategories: {
        '1': {
            expense: [],
            income: []
        }
    },
    budgetSettingsMap: {},
    records: records,
    contacts: [],
    debts: [],
    recurring_transactions: [],
    amortizations: [],
    credit_statements: [],
    groupMeta: [],
    files: [],
    metadata: {
        totalRecords: records.length,
        totalAccounts: Object.keys(ACCOUNT_MAP).length,
        totalLedgers: 1,
        dateRange: {
            start: Math.min(...records.map(r => new Date(r.date).getTime())),
            end: Math.max(...records.map(r => new Date(r.date).getTime()))
        }
    }
};

const jsonContent = JSON.stringify(exportData, null, 2);

// Write to downloads path
try {
    fs.writeFileSync(DEFAULT_OUTPUT_DOWNLOADS, jsonContent, 'utf8');
    console.log(`Saved backup JSON to: ${DEFAULT_OUTPUT_DOWNLOADS}`);
} catch (err) {
    console.warn(`Could not write to downloads path: ${err.message}`);
}

// Write to workspace path
fs.writeFileSync(DEFAULT_OUTPUT_LOCAL, jsonContent, 'utf8');
console.log(`Saved backup JSON to workspace: ${DEFAULT_OUTPUT_LOCAL}`);
