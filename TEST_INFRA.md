# E2E Test Infrastructure & Specification: Complete Ad Removal & System Integrity

## 1. Overview & Testing Philosophy

This test suite provides an **opaque-box, requirement-driven end-to-end (E2E) verification harness** for the "輕鬆記帳 (Easy Accounting)" application following the complete removal of all advertising mechanisms, third-party ad SDKs, and legacy ad states.

### Core Objectives
1. **Ad Absence Verification**: Ensure zero ad service instantiations, zero ad DOM elements, zero ad network scripts/requests, and no leftover ad states or legacy `adFreeUntil` dependencies.
2. **Feature Preservation**: Guarantee that core accounting workflows (recording transactions, account balance calculations, ledger management, categorization, statistics, settings, theme switching, and data export/import) and store resource resolution (`getStoreUrl()`) remain completely functional and crash-free.
3. **4-Tier Structured Methodology**:
   - **Tier 1 — Feature Coverage**: Comprehensive verification of primary behaviors (at least 5 tests per feature).
   - **Tier 2 — Boundary & Corner Cases**: Edge cases including cold-start fresh storage, legacy `adFreeUntil` key presence, offline resilience, and rapid router navigation.
   - **Tier 3 — Cross-Feature Interactions**: Multi-page journey workflows verifying clean transitions across settings, transaction creation, records listing, statistical analysis, and ledger switching.
   - **Tier 4 — Real-World Application Scenarios**: Realistic end-to-end user journeys from onboarding, account setup, multi-ledger budgeting, category customizations, to full data export and migration.

---

## 2. Test Architecture & Runner Setup

### Test Framework
- **Test Runner**: Vitest 5.x (`npx vitest run --config tests/e2e/vitest.config.js`)
- **Execution Environment**: `jsdom` simulating browser DOM, Window, Document, LocalStorage, and Navigation APIs.
- **Data Persistence Mocking**: In-memory IndexedDB mock adhering to `idb` / `DataService` (Schema v15) multi-store operations with shared transaction boundaries.
- **Isolation Principle**: Each test file and test case is completely self-contained with isolated DOM nodes, pristine storage state, and deterministic assertions.

### Directory Layout
```
tests/e2e/
├── vitest.config.js               # Dedicated E2E Vitest configuration
├── setup.js                       # E2E harness setup (DOM, idb mock, window globals)
├── tier1_feature_coverage.test.js # Tier 1: 5 core features, >=5 tests each (25+ tests)
├── tier2_boundary_corner.test.js  # Tier 2: Storage boundary, legacy keys, offline, rapid nav
├── tier3_cross_feature.test.js    # Tier 3: Pairwise & end-to-end multi-page transitions
└── tier4_real_world.test.js       # Tier 4: Comprehensive real-world user lifecycle workflows
```

---

## 3. Test Suites & Tier Coverage Specification

### Tier 1: Feature Coverage (>=5 Tests Per Feature)
1. **Zero Ad Services (`F1`)**:
   - `F1.1`: Application root (`EasyAccountingApp`) instantiates without `rewardService` property.
   - `F1.2`: `window.RewardService` is undefined and cannot be resolved in runtime globals.
   - `F1.3`: Invoking legacy `app.rewardService?.isAdFree()` safely short-circuits to falsy/undefined without error.
   - `F1.4`: Calling non-existent ad reward triggers does not raise unhandled exceptions.
   - `F1.5`: Contract compliance: all active application services contain zero ad methods.

2. **Zero Ad DOM Elements (`F2`)**:
   - `F2.1`: Settings page render output contains no `#settings-banner-ad` container.
   - `F2.2`: Settings page contains no `#sponsor-reward-ad-btn` button element.
   - `F2.3`: No elements with class or text mentioning "觀看廣告以移除廣告" or "已啟用無廣告模式".
   - `F2.4`: Navigation across all primary views (home, records, add, stats, settings) renders zero ad banner elements.
   - `F2.5`: Dialogs, modals, and toasts never mount ad placeholders or sponsor popups.

3. **Zero Ad Scripts & Network Invocations (`F3`)**:
   - `F3.1`: No Google AdSense script (`adsbygoogle.js`) dynamically appended to `document.head`.
   - `F3.2`: No Google Publisher Tag script (`gpt.js`) dynamically appended to `document.head`.
   - `F3.3`: No network fetch requests initiated for `/internal-ads.json`.
   - `F3.4`: No window-level `googletag` or `adsbygoogle` objects created or accessed.
   - `F3.5`: Privacy page contains updated clauses without third-party advertising tracking statements.

4. **Store URL & Resource Retention (`F4`)**:
   - `F4.1`: `getStoreUrl('plugins/my-plugin.js')` generates valid relative URL in web mode.
   - `F4.2`: `getStoreUrl('/themes/custom.json')` properly normalizes leading slashes.
   - `F4.3`: `getStoreUrl` with native Capacitor mock prepends `__WEB_STORE_URL__` correctly.
   - `F4.4`: `__WEB_STORE_URL__` defaults gracefully when custom adConfig is absent.
   - `F4.5`: Querying store resources does not trigger ad tracking parameters or headers.

5. **Core Accounting Flow Preservation (`F5`)**:
   - `F5.1`: Create income and expense transactions in default ledger with accurate balance calculation.
   - `F5.2`: Filter records by date ranges (week, month, custom) with consistent totals.
   - `F5.3`: Multi-ledger creation, ledger switching, and ledger-scoped data isolation.
   - `F5.4`: Category manager CRUD operations and category-based breakdown aggregation.
   - `F5.5`: Statistics summary generation without undefined service errors.

---

### Tier 2: Boundary & Corner Cases (>=5 Tests Per Feature)
1. **Fresh Storage Cold Start**:
   - Initial application startup with empty `localStorage` and pristine IndexedDB.
   - Default ledger `#1` auto-generated with default categories and zero initial balance.
   - Default theme and settings applied without requiring ad status bootstrap.
   - App renders all main pages without throwing on missing storage keys.
   - No automatic creation of `adFreeUntil` key on cold start.

2. **Legacy `localStorage` Cleanup & Stale State**:
   - Startup with legacy `adFreeUntil` key set to past timestamp.
   - Startup with legacy `adFreeUntil` key set to future timestamp.
   - Startup with corrupted non-numeric `adFreeUntil` string values.
   - System cleans up or ignores legacy ad keys without impacting application state.
   - Writing user settings does not reintroduce `adFreeUntil`.

3. **Offline Mode & Network Resilience**:
   - Application operation with `navigator.onLine = false`.
   - Accounting CRUD and statistics computation perform 100% locally in offline mode.
   - Navigation between all views succeeds without waiting for remote ad network timeouts.
   - Reconnecting `online` does not spawn delayed ad requests.
   - Service worker precache manifest generation functions without ad assets.

4. **Rapid Router Navigation & Race Conditions**:
   - Rapid consecutive hash changes (`#home` -> `#settings` -> `#records` -> `#add` -> `#stats`).
   - Quick double-clicks on navigation items do not cause duplicate DOM injection or memory leaks.
   - Interrupted page rendering recovers cleanly on subsequent route transition.
   - No asynchronous ad render timers (`setTimeout`) fire after page unmount.
   - Event listeners detached cleanly on route exit.

---

### Tier 3: Cross-Feature Interactions
1. **Multi-Page Journey**:
   - Settings configuration -> create account -> add transaction -> view records list -> check stats chart -> switch ledger.
2. **Ledger Isolation with Transactions**:
   - Ledger A (personal) and Ledger B (business) have distinct records and independent balances.
3. **Theme & UI Synchronization**:
   - Toggle theme mode (`system` -> `dark` -> `light`) across various pages without layout disruptions.
4. **Data Export & Import Integrity**:
   - Complete ledger and record backup exported to JSON, verified for absence of ad fields, and re-imported cleanly.

---

### Tier 4: Real-World Application Scenarios
1. **User Lifecycle Scenario 1 (Daily Expense Tracking)**:
   - User opens app, creates custom "Salary" income ($50,000) and "Dining" expense ($350).
   - Records list reflects transactions, home page balance card displays net savings ($49,650).
2. **User Lifecycle Scenario 2 (Multi-Account & Transfer Management)**:
   - User creates "Bank Account" and "Cash Wallet".
   - Records transfer and verifies account balances match double-entry flow.
3. **User Lifecycle Scenario 3 (Travel Project Multi-Ledger)**:
   - User creates "Japan Trip 2026" ledger, logs expenses in JPY/TWD, views stats breakdown.
   - Switches back to "Personal" ledger with complete data isolation preserved.
4. **User Lifecycle Scenario 4 (Full Backup & Restore)**:
   - Full data payload export, local database purge, full restore verification.

---

## 4. Test Runner Instructions

To execute the entire E2E test suite:
```bash
npx vitest run --config tests/e2e/vitest.config.js
```

To run individual tiers:
```bash
npx vitest run tests/e2e/tier1_feature_coverage.test.js --config tests/e2e/vitest.config.js
npx vitest run tests/e2e/tier2_boundary_corner.test.js --config tests/e2e/vitest.config.js
npx vitest run tests/e2e/tier3_cross_feature.test.js --config tests/e2e/vitest.config.js
npx vitest run tests/e2e/tier4_real_world.test.js --config tests/e2e/vitest.config.js
```
