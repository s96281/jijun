import { describe, it, expect, beforeEach } from 'vitest';
import DataService from '../../src/js/dataService.js';
import { CategoryManager } from '../../src/js/categoryManager.js';
import fs from 'fs';
import path from 'path';

function stubFileReader(content) {
    const OriginalFileReader = globalThis.FileReader;
    globalThis.FileReader = class {
        readAsText() {
            this.result = content;
            if (this.onload) this.onload({ target: this });
        }
    };
    return () => {
        globalThis.FileReader = OriginalFileReader;
    };
}

describe('ledger_backup.json import test', () => {
    let ds;
    let cm;

    beforeEach(async () => {
        localStorage.clear();
        ds = new DataService();
        ds.db = await globalThis.idb.openDB();
        ds.activeLedgerId = 1;
        cm = new CategoryManager(ds);
    });

    it('successfully imports ledger_backup.json with 827 records, 5 accounts, and custom categories', async () => {
        const jsonPath = path.resolve('ledger_backup.json');
        if (!fs.existsSync(jsonPath)) {
            console.warn('ledger_backup.json not found, skipping import test');
            return;
        }
        const jsonContent = fs.readFileSync(jsonPath, 'utf8');

        const restore = stubFileReader(jsonContent);
        try {
            const res = await ds.importData({ name: 'ledger_backup.json' }, { skipConfirm: true });
            expect(res.success).toBe(true);

            // Verify records
            const records = await ds.getRecords({ allLedgers: true });
            expect(records.length).toBe(827);

            // Verify accounts
            const accounts = await ds.getAccounts({ allLedgers: true });
            expect(accounts.length).toBe(5);
            const accountNames = accounts.map(a => a.name).sort();
            expect(accountNames).toEqual(['交通', '吃喝', '收入', '生活', '購物'].sort());

            // Verify advancedAccountModeEnabled
            const advancedMode = await ds.getSetting('advancedAccountModeEnabled');
            expect(advancedMode.value).toBe(true);

            // Verify all records have valid positive amounts
            for (const r of records) {
                expect(typeof r.amount).toBe('number');
                expect(r.amount).toBeGreaterThanOrEqual(0);
                expect(['expense', 'income']).toContain(r.type);
                expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
                expect(r.accountId).toBeDefined();
            }

            // Verify CategoryManager integration
            await cm.init();
            const customExpenseCats = cm.customCategories.expense.map(c => c.name);
            expect(customExpenseCats).toContain('其他購物');
            expect(customExpenseCats).toContain('美容美髮');
            expect(customExpenseCats).toContain('午餐');
            expect(customExpenseCats).toContain('甜點');
            expect(customExpenseCats).toContain('其他交通');

            const customIncomeCats = cm.customCategories.income.map(c => c.name);
            expect(customIncomeCats).toContain('其他收入');

            // Verify every record category resolves in CategoryManager
            for (const r of records) {
                const cat = cm.getCategoryById(r.type, r.category);
                expect(cat).toBeDefined();
                expect(cat).not.toBeNull();
                expect(cat.name).toBeDefined();
            }
        } finally {
            restore();
        }
    });
});
