/**
 * Tier 1 Shared Utility Tests
 * Run with: node tests/test-tier1.js
 *
 * Tests the shared functions extracted from per-mode implementations.
 * These functions are defined in index.html — copies are inlined here
 * so tests run standalone without a browser.
 */

// ── Simple test framework (no dependencies) ──────────────────────────

let _passed = 0, _failed = 0, _total = 0, _currentDescribe = '';

function describe(name, fn) {
    _currentDescribe = name;
    console.log(`\n  ${name}`);
    fn();
}

function it(name, fn) {
    _total++;
    try {
        fn();
        _passed++;
        console.log(`    \x1b[32m✓\x1b[0m ${name}`);
    } catch (e) {
        _failed++;
        console.log(`    \x1b[31m✗\x1b[0m ${name}`);
        console.log(`      \x1b[31m${e.message}\x1b[0m`);
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

function assertDeepEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
        throw new Error(msg || `Expected:\n        ${b}\n      Got:\n        ${a}`);
    }
}

function assertApprox(actual, expected, tolerance, msg) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(msg || `Expected ~${expected} (±${tolerance}), got ${actual}`);
    }
}

// ── Mock localStorage ────────────────────────────────────────────────

class MockLocalStorage {
    constructor() { this.store = {}; }
    getItem(key) { return key in this.store ? this.store[key] : null; }
    setItem(key, val) { this.store[key] = String(val); }
    removeItem(key) { delete this.store[key]; }
    clear() { this.store = {}; }
}

let localStorage;
let _confirmResult = true;
function confirm(msg) { return _confirmResult; }

function resetMocks() {
    localStorage = new MockLocalStorage();
    _confirmResult = true;
}

// ── Functions under test (duplicated from index.html) ────────────────
// These MUST match the implementations in index.html exactly.

/**
 * Get problem areas using score-based ranking (successRate + slowRate).
 * Used by: int, ch, iivi, sc, ext, alt, adv, miivi, kb, jtou, dom7v (11 modes)
 *
 * Cumulative stats shape: { [name]: { attempts, firstTry, totalTime, slow? } }
 */
function getGenericProblemAreas(cumulativeStats, minAttempts) {
    if (!cumulativeStats) return [];
    if (minAttempts === undefined) minAttempts = 5;
    const areas = [];
    for (const [name, data] of Object.entries(cumulativeStats)) {
        if (data.attempts >= minAttempts) {
            const successRate = (data.firstTry / data.attempts) * 100;
            const slowRate = ((data.slow || 0) / data.attempts) * 100;
            const avgTime = data.totalTime / data.attempts;
            const problemScore = (100 - successRate) + slowRate;
            areas.push({
                name, successRate, slowRate, avgTime,
                attempts: data.attempts, firstTry: data.firstTry,
                slow: data.slow || 0, problemScore
            });
        }
    }
    return areas.sort((a, b) => b.problemScore - a.problemScore);
}

/**
 * Get problem areas using mistake-rate filtering.
 * Used by: bebop, tritone, shell, upper, freestyle (5 modes), pent (with avgTimeThreshold)
 *
 * Cumulative stats shape: { [name]: { attempts, mistakes, times? } }
 */
function getGenericMistakeAreas(cumulativeStats, minAttempts, opts) {
    if (!cumulativeStats) return [];
    if (minAttempts === undefined) minAttempts = 3;
    opts = opts || {};
    const maxResults = opts.maxResults || 5;
    const avgTimeThreshold = opts.avgTimeThreshold || null;
    const dominated = [];
    for (const [key, data] of Object.entries(cumulativeStats)) {
        if (data.attempts >= minAttempts) {
            const mistakeRate = data.mistakes / data.attempts;
            let avgTime = 0;
            if (data.times && data.times.length > 0) {
                avgTime = data.times.reduce((a, b) => a + b, 0) / data.times.length;
            }
            if (mistakeRate > 0.3 || (avgTimeThreshold && avgTime > avgTimeThreshold)) {
                dominated.push({ key, mistakeRate, avgTime, attempts: data.attempts });
            }
        }
    }
    return dominated.sort((a, b) => b.mistakeRate - a.mistakeRate).slice(0, maxResults);
}

/**
 * Merge session stats into cumulative stats (time-based pattern).
 * Used by: int, ch, iivi, sc, ext, alt, adv, miivi, kb, jtou, dom7v, extv (12 modes)
 *
 * Session stats shape: { [name]: { total, firstTry, times: [], slow? } }
 * Cumulative stats shape: { [name]: { attempts, firstTry, totalTime, slow } }
 */
function updateGenericCumulativeStats(storageKey, sessionStats, cumulativeStats) {
    for (const [name, data] of Object.entries(sessionStats)) {
        if (!cumulativeStats[name]) {
            cumulativeStats[name] = { attempts: 0, firstTry: 0, totalTime: 0, slow: 0 };
        }
        cumulativeStats[name].attempts += data.total;
        cumulativeStats[name].firstTry += data.firstTry;
        cumulativeStats[name].totalTime += data.times.reduce((a, b) => a + b, 0);
        cumulativeStats[name].slow += (data.slow || 0);
    }
    localStorage.setItem(storageKey, JSON.stringify(cumulativeStats));
}

/**
 * Merge session stats into cumulative stats (mistake-based pattern).
 * Used by: bebop, tritone, shell, upper, freestyle (5 modes)
 *
 * Session stats shape: { [name]: { attempts, mistakes } }
 * Cumulative stats shape: { [name]: { attempts, mistakes } }
 */
function updateMistakeCumulativeStats(storageKey, sessionStats, cumulativeStats) {
    for (const [key, stat] of Object.entries(sessionStats)) {
        if (!cumulativeStats[key]) {
            cumulativeStats[key] = { attempts: 0, mistakes: 0 };
        }
        cumulativeStats[key].attempts += stat.attempts;
        cumulativeStats[key].mistakes += stat.mistakes;
    }
    localStorage.setItem(storageKey, JSON.stringify(cumulativeStats));
}

/**
 * Clear history and cumulative stats from localStorage.
 * Used by: all modes with cumulative stats (18 modes) + vl, cmod (pass null for cumulativeKey)
 *
 * Returns true if user confirmed, false if cancelled.
 * Caller is responsible for clearing in-memory state (e.g. int_history = []).
 */
function clearGenericHistory(historyKey, cumulativeKey, renderFn) {
    if (!confirm('Clear all history and statistics for this mode?')) return false;
    localStorage.removeItem(historyKey);
    if (cumulativeKey) localStorage.removeItem(cumulativeKey);
    renderFn();
    return true;
}

// ── Tests ────────────────────────────────────────────────────────────

console.log('\n\x1b[1mTier 1 Shared Utility Tests\x1b[0m');

// ── getGenericProblemAreas ───────────────────────────────────────────

describe('getGenericProblemAreas', () => {
    it('returns empty array for null/undefined input', () => {
        assertDeepEqual(getGenericProblemAreas(null), []);
        assertDeepEqual(getGenericProblemAreas(undefined), []);
    });

    it('returns empty array for empty stats object', () => {
        assertDeepEqual(getGenericProblemAreas({}), []);
    });

    it('filters out entries below default minAttempts (5)', () => {
        const stats = {
            'C Major': { attempts: 4, firstTry: 2, totalTime: 8, slow: 1 },
            'D Minor': { attempts: 5, firstTry: 3, totalTime: 10, slow: 1 }
        };
        const result = getGenericProblemAreas(stats);
        assertEqual(result.length, 1);
        assertEqual(result[0].name, 'D Minor');
    });

    it('respects custom minAttempts', () => {
        const stats = {
            'C Major': { attempts: 3, firstTry: 1, totalTime: 6, slow: 1 }
        };
        assertEqual(getGenericProblemAreas(stats, 5).length, 0);
        assertEqual(getGenericProblemAreas(stats, 3).length, 1);
        assertEqual(getGenericProblemAreas(stats, 2).length, 1);
    });

    it('calculates successRate correctly', () => {
        const stats = {
            'C Major': { attempts: 10, firstTry: 7, totalTime: 20, slow: 0 }
        };
        const result = getGenericProblemAreas(stats);
        assertEqual(result[0].successRate, 70);
    });

    it('calculates slowRate correctly', () => {
        const stats = {
            'C Major': { attempts: 10, firstTry: 8, totalTime: 20, slow: 3 }
        };
        const result = getGenericProblemAreas(stats);
        assertEqual(result[0].slowRate, 30);
    });

    it('calculates avgTime correctly', () => {
        const stats = {
            'C Major': { attempts: 4, firstTry: 3, totalTime: 6.8, slow: 0 }
        };
        const result = getGenericProblemAreas(stats, 3);
        assertApprox(result[0].avgTime, 1.7, 0.001);
    });

    it('calculates problemScore as (100 - successRate) + slowRate', () => {
        const stats = {
            'C Major': { attempts: 10, firstTry: 6, totalTime: 20, slow: 2 }
        };
        const result = getGenericProblemAreas(stats);
        // successRate = 60, slowRate = 20, problemScore = 40 + 20 = 60
        assertEqual(result[0].problemScore, 60);
    });

    it('sorts by problemScore descending (worst first)', () => {
        const stats = {
            'Easy':   { attempts: 10, firstTry: 9, totalTime: 15, slow: 0 },  // score: 10
            'Hard':   { attempts: 10, firstTry: 3, totalTime: 30, slow: 5 },  // score: 70+50=120
            'Medium': { attempts: 10, firstTry: 6, totalTime: 20, slow: 2 }   // score: 40+20=60
        };
        const result = getGenericProblemAreas(stats);
        assertEqual(result[0].name, 'Hard');
        assertEqual(result[1].name, 'Medium');
        assertEqual(result[2].name, 'Easy');
    });

    it('handles missing slow field (defaults to 0)', () => {
        const stats = {
            'C Major': { attempts: 10, firstTry: 5, totalTime: 20 }
        };
        const result = getGenericProblemAreas(stats);
        assertEqual(result[0].slow, 0);
        assertEqual(result[0].slowRate, 0);
        assertEqual(result[0].problemScore, 50); // (100-50) + 0
    });

    it('returns all required fields', () => {
        const stats = {
            'C Major': { attempts: 10, firstTry: 7, totalTime: 20, slow: 2 }
        };
        const result = getGenericProblemAreas(stats);
        const area = result[0];
        assert('name' in area, 'missing name');
        assert('successRate' in area, 'missing successRate');
        assert('slowRate' in area, 'missing slowRate');
        assert('avgTime' in area, 'missing avgTime');
        assert('attempts' in area, 'missing attempts');
        assert('firstTry' in area, 'missing firstTry');
        assert('slow' in area, 'missing slow');
        assert('problemScore' in area, 'missing problemScore');
    });

    it('handles all-perfect scores', () => {
        const stats = {
            'C Major': { attempts: 10, firstTry: 10, totalTime: 10, slow: 0 }
        };
        const result = getGenericProblemAreas(stats);
        assertEqual(result[0].successRate, 100);
        assertEqual(result[0].problemScore, 0);
    });

    it('handles all-failure scores', () => {
        const stats = {
            'C Major': { attempts: 10, firstTry: 0, totalTime: 40, slow: 10 }
        };
        const result = getGenericProblemAreas(stats);
        assertEqual(result[0].successRate, 0);
        assertEqual(result[0].slowRate, 100);
        assertEqual(result[0].problemScore, 200);
    });

    it('works for sc pattern (no slow in cumulative stats)', () => {
        // sc mode doesn't store slow in cumulative stats
        const stats = {
            'C Dorian': { attempts: 8, firstTry: 6, totalTime: 32 }
        };
        const result = getGenericProblemAreas(stats);
        assertEqual(result[0].slowRate, 0);
        assertEqual(result[0].slow, 0);
        // problemScore = (100 - 75) + 0 = 25
        assertEqual(result[0].problemScore, 25);
    });

    it('works for dom7v pattern (minAttempts=3)', () => {
        const stats = {
            'Cmaj7 (A)': { attempts: 3, firstTry: 1, totalTime: 9, slow: 1 }
        };
        // Default minAttempts=5 would filter this out
        assertEqual(getGenericProblemAreas(stats).length, 0);
        // With minAttempts=3 it should be included
        assertEqual(getGenericProblemAreas(stats, 3).length, 1);
    });
});

// ── getGenericMistakeAreas ──────────────────────────────────────────

describe('getGenericMistakeAreas', () => {
    it('returns empty array for null/undefined input', () => {
        assertDeepEqual(getGenericMistakeAreas(null), []);
        assertDeepEqual(getGenericMistakeAreas(undefined), []);
    });

    it('returns empty array for empty stats object', () => {
        assertDeepEqual(getGenericMistakeAreas({}), []);
    });

    it('filters out entries below default minAttempts (3)', () => {
        const stats = {
            'C': { attempts: 2, mistakes: 2 },
            'D': { attempts: 3, mistakes: 3 }
        };
        const result = getGenericMistakeAreas(stats);
        assertEqual(result.length, 1);
        assertEqual(result[0].key, 'D');
    });

    it('only includes entries with mistakeRate > 0.3', () => {
        const stats = {
            'Good': { attempts: 10, mistakes: 2 },   // 0.2 - excluded
            'Bad':  { attempts: 10, mistakes: 5 },    // 0.5 - included
            'OK':   { attempts: 10, mistakes: 3 }     // 0.3 - excluded (not >0.3)
        };
        const result = getGenericMistakeAreas(stats);
        assertEqual(result.length, 1);
        assertEqual(result[0].key, 'Bad');
    });

    it('sorts by mistakeRate descending', () => {
        const stats = {
            'Medium': { attempts: 10, mistakes: 5 },   // 0.5
            'Worst':  { attempts: 10, mistakes: 9 },   // 0.9
            'Bad':    { attempts: 10, mistakes: 7 }     // 0.7
        };
        const result = getGenericMistakeAreas(stats);
        assertEqual(result[0].key, 'Worst');
        assertEqual(result[1].key, 'Bad');
        assertEqual(result[2].key, 'Medium');
    });

    it('limits to 5 results by default', () => {
        const stats = {};
        for (let i = 0; i < 10; i++) {
            stats[`Item${i}`] = { attempts: 10, mistakes: 8 };
        }
        const result = getGenericMistakeAreas(stats);
        assertEqual(result.length, 5);
    });

    it('respects custom maxResults', () => {
        const stats = {};
        for (let i = 0; i < 10; i++) {
            stats[`Item${i}`] = { attempts: 10, mistakes: 8 };
        }
        const result = getGenericMistakeAreas(stats, 3, { maxResults: 3 });
        assertEqual(result.length, 3);
    });

    it('returns correct fields', () => {
        const stats = {
            'C Shell': { attempts: 10, mistakes: 5 }
        };
        const result = getGenericMistakeAreas(stats);
        const area = result[0];
        assert('key' in area, 'missing key');
        assert('mistakeRate' in area, 'missing mistakeRate');
        assert('avgTime' in area, 'missing avgTime');
        assert('attempts' in area, 'missing attempts');
    });

    it('calculates mistakeRate correctly', () => {
        const stats = {
            'C': { attempts: 8, mistakes: 6 }
        };
        const result = getGenericMistakeAreas(stats);
        assertEqual(result[0].mistakeRate, 0.75);
    });

    it('includes avgTimeThreshold when provided (pent pattern)', () => {
        const stats = {
            'Fast but wrong': { attempts: 10, mistakes: 5, times: [1, 1, 1] },          // mistakeRate 0.5, avg 1
            'Slow but right': { attempts: 10, mistakes: 1, times: [4, 4, 4, 4, 4] },    // mistakeRate 0.1, avg 4
            'Fast and right': { attempts: 10, mistakes: 1, times: [1, 1, 1, 1, 1] }     // mistakeRate 0.1, avg 1
        };
        const result = getGenericMistakeAreas(stats, 3, { avgTimeThreshold: 3 });
        assertEqual(result.length, 2);
        // 'Fast but wrong' included for mistakeRate > 0.3
        // 'Slow but right' included for avgTime > 3
        // 'Fast and right' excluded (both below thresholds)
    });

    it('handles entries with no times array', () => {
        const stats = {
            'C': { attempts: 10, mistakes: 5 }
        };
        const result = getGenericMistakeAreas(stats);
        assertEqual(result[0].avgTime, 0);
    });

    it('handles empty times array', () => {
        const stats = {
            'C': { attempts: 10, mistakes: 5, times: [] }
        };
        const result = getGenericMistakeAreas(stats);
        assertEqual(result[0].avgTime, 0);
    });
});

// ── updateGenericCumulativeStats ────────────────────────────────────

describe('updateGenericCumulativeStats', () => {
    beforeEach: resetMocks();

    it('creates new cumulative entry for unseen names', () => {
        resetMocks();
        const cumulative = {};
        const session = {
            'C Major': { total: 3, firstTry: 2, times: [1.5, 2.0, 1.8], slow: 1 }
        };
        updateGenericCumulativeStats('testKey', session, cumulative);
        assertEqual(cumulative['C Major'].attempts, 3);
        assertEqual(cumulative['C Major'].firstTry, 2);
        assertApprox(cumulative['C Major'].totalTime, 5.3, 0.001);
        assertEqual(cumulative['C Major'].slow, 1);
    });

    it('accumulates into existing cumulative entry', () => {
        resetMocks();
        const cumulative = {
            'C Major': { attempts: 5, firstTry: 4, totalTime: 8.0, slow: 1 }
        };
        const session = {
            'C Major': { total: 3, firstTry: 2, times: [1.5, 2.0, 1.8], slow: 1 }
        };
        updateGenericCumulativeStats('testKey', session, cumulative);
        assertEqual(cumulative['C Major'].attempts, 8);
        assertEqual(cumulative['C Major'].firstTry, 6);
        assertApprox(cumulative['C Major'].totalTime, 13.3, 0.001);
        assertEqual(cumulative['C Major'].slow, 2);
    });

    it('handles multiple entries in session', () => {
        resetMocks();
        const cumulative = {};
        const session = {
            'C Major': { total: 2, firstTry: 1, times: [1.0, 2.0], slow: 1 },
            'D Minor': { total: 3, firstTry: 3, times: [0.5, 0.8, 0.6], slow: 0 }
        };
        updateGenericCumulativeStats('testKey', session, cumulative);
        assertEqual(cumulative['C Major'].attempts, 2);
        assertEqual(cumulative['D Minor'].attempts, 3);
        assertEqual(cumulative['D Minor'].firstTry, 3);
    });

    it('handles missing slow field (defaults to 0)', () => {
        resetMocks();
        const cumulative = {};
        const session = {
            'C Dorian': { total: 4, firstTry: 3, times: [3.0, 4.0, 3.5, 5.0] }
        };
        updateGenericCumulativeStats('testKey', session, cumulative);
        assertEqual(cumulative['C Dorian'].slow, 0);
    });

    it('saves to localStorage', () => {
        resetMocks();
        const cumulative = {};
        const session = {
            'C Major': { total: 1, firstTry: 1, times: [1.0], slow: 0 }
        };
        updateGenericCumulativeStats('myCumKey', session, cumulative);
        const saved = JSON.parse(localStorage.getItem('myCumKey'));
        assertEqual(saved['C Major'].attempts, 1);
        assertEqual(saved['C Major'].firstTry, 1);
    });

    it('preserves existing entries not in session', () => {
        resetMocks();
        const cumulative = {
            'D Minor': { attempts: 10, firstTry: 8, totalTime: 15, slow: 1 }
        };
        const session = {
            'C Major': { total: 1, firstTry: 1, times: [1.0], slow: 0 }
        };
        updateGenericCumulativeStats('testKey', session, cumulative);
        assertEqual(cumulative['D Minor'].attempts, 10); // unchanged
        assertEqual(cumulative['C Major'].attempts, 1);   // new
    });

    it('handles empty session stats', () => {
        resetMocks();
        const cumulative = { 'C Major': { attempts: 5, firstTry: 3, totalTime: 10, slow: 1 } };
        updateGenericCumulativeStats('testKey', {}, cumulative);
        assertEqual(cumulative['C Major'].attempts, 5); // unchanged
    });

    it('handles empty times array', () => {
        resetMocks();
        const cumulative = {};
        const session = {
            'C Major': { total: 0, firstTry: 0, times: [], slow: 0 }
        };
        updateGenericCumulativeStats('testKey', session, cumulative);
        assertEqual(cumulative['C Major'].totalTime, 0);
    });
});

// ── updateMistakeCumulativeStats ────────────────────────────────────

describe('updateMistakeCumulativeStats', () => {
    it('creates new entry for unseen names', () => {
        resetMocks();
        const cumulative = {};
        const session = {
            'C Shell': { attempts: 5, mistakes: 2 }
        };
        updateMistakeCumulativeStats('testKey', session, cumulative);
        assertEqual(cumulative['C Shell'].attempts, 5);
        assertEqual(cumulative['C Shell'].mistakes, 2);
    });

    it('accumulates into existing entry', () => {
        resetMocks();
        const cumulative = {
            'C Shell': { attempts: 10, mistakes: 3 }
        };
        const session = {
            'C Shell': { attempts: 5, mistakes: 2 }
        };
        updateMistakeCumulativeStats('testKey', session, cumulative);
        assertEqual(cumulative['C Shell'].attempts, 15);
        assertEqual(cumulative['C Shell'].mistakes, 5);
    });

    it('handles multiple entries', () => {
        resetMocks();
        const cumulative = {};
        const session = {
            'C': { attempts: 3, mistakes: 1 },
            'D': { attempts: 4, mistakes: 2 }
        };
        updateMistakeCumulativeStats('testKey', session, cumulative);
        assertEqual(cumulative['C'].attempts, 3);
        assertEqual(cumulative['D'].mistakes, 2);
    });

    it('saves to localStorage', () => {
        resetMocks();
        const cumulative = {};
        const session = {
            'C': { attempts: 3, mistakes: 1 }
        };
        updateMistakeCumulativeStats('shellCum', session, cumulative);
        const saved = JSON.parse(localStorage.getItem('shellCum'));
        assertEqual(saved['C'].attempts, 3);
        assertEqual(saved['C'].mistakes, 1);
    });

    it('preserves existing entries not in session', () => {
        resetMocks();
        const cumulative = {
            'D': { attempts: 10, mistakes: 4 }
        };
        const session = {
            'C': { attempts: 3, mistakes: 1 }
        };
        updateMistakeCumulativeStats('testKey', session, cumulative);
        assertEqual(cumulative['D'].attempts, 10);
        assertEqual(cumulative['C'].attempts, 3);
    });

    it('handles empty session', () => {
        resetMocks();
        const cumulative = { 'C': { attempts: 5, mistakes: 2 } };
        updateMistakeCumulativeStats('testKey', {}, cumulative);
        assertEqual(cumulative['C'].attempts, 5);
    });
});

// ── clearGenericHistory ─────────────────────────────────────────────

describe('clearGenericHistory', () => {
    it('removes historyKey from localStorage on confirm', () => {
        resetMocks();
        localStorage.setItem('myHistory', '[{"date":"2025-01-01"}]');
        let renderCalled = false;
        clearGenericHistory('myHistory', null, () => { renderCalled = true; });
        assertEqual(localStorage.getItem('myHistory'), null);
        assert(renderCalled, 'renderFn should be called');
    });

    it('removes cumulativeKey from localStorage on confirm', () => {
        resetMocks();
        localStorage.setItem('myHistory', '[]');
        localStorage.setItem('myCumulative', '{}');
        clearGenericHistory('myHistory', 'myCumulative', () => {});
        assertEqual(localStorage.getItem('myHistory'), null);
        assertEqual(localStorage.getItem('myCumulative'), null);
    });

    it('returns true on confirm', () => {
        resetMocks();
        const result = clearGenericHistory('h', 'c', () => {});
        assertEqual(result, true);
    });

    it('does nothing when user cancels', () => {
        resetMocks();
        _confirmResult = false;
        localStorage.setItem('myHistory', '[1,2,3]');
        localStorage.setItem('myCumulative', '{"a":1}');
        let renderCalled = false;
        const result = clearGenericHistory('myHistory', 'myCumulative', () => { renderCalled = true; });
        assertEqual(result, false);
        assertEqual(localStorage.getItem('myHistory'), '[1,2,3]');
        assertEqual(localStorage.getItem('myCumulative'), '{"a":1}');
        assert(!renderCalled, 'renderFn should NOT be called on cancel');
    });

    it('handles null cumulativeKey (vl/cmod modes)', () => {
        resetMocks();
        localStorage.setItem('vl_history', '[]');
        clearGenericHistory('vl_history', null, () => {});
        assertEqual(localStorage.getItem('vl_history'), null);
    });

    it('calls renderFn exactly once on confirm', () => {
        resetMocks();
        let callCount = 0;
        clearGenericHistory('h', null, () => { callCount++; });
        assertEqual(callCount, 1);
    });
});

// ── Cross-function integration tests ────────────────────────────────

describe('Integration: updateGenericCumulativeStats → getGenericProblemAreas', () => {
    it('round-trips correctly: update stats then find problems', () => {
        resetMocks();
        const cumulative = {};

        // Simulate 3 game sessions
        updateGenericCumulativeStats('testKey', {
            'C Major': { total: 5, firstTry: 4, times: [1.0, 1.2, 1.1, 1.3, 1.0], slow: 0 },
            'D Minor': { total: 5, firstTry: 2, times: [2.5, 3.0, 2.8, 3.2, 2.1], slow: 3 }
        }, cumulative);

        const problems = getGenericProblemAreas(cumulative);
        assertEqual(problems.length, 2);
        assertEqual(problems[0].name, 'D Minor'); // worse score
        assertEqual(problems[1].name, 'C Major'); // better score
    });

    it('shows no problems when everything is perfect', () => {
        resetMocks();
        const cumulative = {};
        updateGenericCumulativeStats('testKey', {
            'C Major': { total: 10, firstTry: 10, times: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], slow: 0 }
        }, cumulative);
        const problems = getGenericProblemAreas(cumulative);
        assertEqual(problems.length, 1);
        assertEqual(problems[0].problemScore, 0);
    });
});

describe('Integration: updateMistakeCumulativeStats → getGenericMistakeAreas', () => {
    it('round-trips correctly: update stats then find problem areas', () => {
        resetMocks();
        const cumulative = {};

        updateMistakeCumulativeStats('testKey', {
            'Good':  { attempts: 10, mistakes: 1 },
            'Bad':   { attempts: 10, mistakes: 8 },
            'OK':    { attempts: 10, mistakes: 2 }
        }, cumulative);

        const problems = getGenericMistakeAreas(cumulative);
        assertEqual(problems.length, 1); // only Bad (0.8 > 0.3)
        assertEqual(problems[0].key, 'Bad');
    });
});

describe('Integration: clearGenericHistory clears what updateCumulativeStats saved', () => {
    it('clears both history and cumulative stats', () => {
        resetMocks();
        localStorage.setItem('int_history', JSON.stringify([{ date: '2025-01-01' }]));

        const cumulative = {};
        updateGenericCumulativeStats('int_cumulative', {
            'C': { total: 5, firstTry: 3, times: [1, 2, 3, 4, 5], slow: 2 }
        }, cumulative);

        // Verify data exists
        assert(localStorage.getItem('int_history') !== null);
        assert(localStorage.getItem('int_cumulative') !== null);

        // Clear it
        let rendered = false;
        clearGenericHistory('int_history', 'int_cumulative', () => { rendered = true; });

        // Verify data is gone
        assertEqual(localStorage.getItem('int_history'), null);
        assertEqual(localStorage.getItem('int_cumulative'), null);
        assert(rendered);
    });
});

// ── Behavioral equivalence tests ────────────────────────────────────
// These test that the generic functions produce the EXACT same output
// as the original per-mode functions would for given inputs.

describe('Equivalence: intGetProblemAreas (minAttempts=5)', () => {
    it('produces same output as original int implementation', () => {
        const stats = {
            'C Minor 3rd':  { attempts: 12, firstTry: 8, totalTime: 18.5, slow: 2 },
            'D Major 3rd':  { attempts: 8, firstTry: 7, totalTime: 10.2, slow: 0 },
            'E Perfect 5th': { attempts: 3, firstTry: 1, totalTime: 6.0, slow: 2 },  // filtered (< 5)
            'F Tritone':    { attempts: 6, firstTry: 2, totalTime: 15.0, slow: 4 }
        };
        const result = getGenericProblemAreas(stats, 5);

        assertEqual(result.length, 3);
        // F Tritone should be worst: successRate=33.3, slowRate=66.7, problemScore=133.3
        assertEqual(result[0].name, 'F Tritone');
        assertApprox(result[0].successRate, 33.33, 0.01);
        assertApprox(result[0].slowRate, 66.67, 0.01);
        // C Minor 3rd: successRate=66.7, slowRate=16.7, problemScore=50
        assertEqual(result[1].name, 'C Minor 3rd');
        // D Major 3rd: successRate=87.5, slowRate=0, problemScore=12.5
        assertEqual(result[2].name, 'D Major 3rd');
    });
});

describe('Equivalence: dom7vGetProblemAreas (minAttempts=3)', () => {
    it('produces same output as original dom7v implementation', () => {
        const stats = {
            'Cmaj7 (A)': { attempts: 3, firstTry: 2, totalTime: 5.5, slow: 1 },
            'Dm7 (B)':   { attempts: 4, firstTry: 1, totalTime: 12, slow: 3 },
            'G7 (A)':    { attempts: 2, firstTry: 1, totalTime: 4, slow: 1 }  // filtered
        };
        const result = getGenericProblemAreas(stats, 3);
        assertEqual(result.length, 2);
        assertEqual(result[0].name, 'Dm7 (B)');
        assertEqual(result[1].name, 'Cmaj7 (A)');
    });
});

describe('Equivalence: scGetProblemAreas (no slow tracking)', () => {
    it('produces same ranking as sc (problemScore = 100 - successRate)', () => {
        // sc cumulative stats don't have slow field
        const stats = {
            'C Dorian':     { attempts: 10, firstTry: 9, totalTime: 30 },
            'D Mixolydian': { attempts: 10, firstTry: 5, totalTime: 40 }
        };
        const result = getGenericProblemAreas(stats);
        // D Mixolydian: problemScore = (100-50) + 0 = 50
        // C Dorian: problemScore = (100-90) + 0 = 10
        assertEqual(result[0].name, 'D Mixolydian');
        assertEqual(result[0].problemScore, 50);
        assertEqual(result[1].name, 'C Dorian');
        assertEqual(result[1].problemScore, 10);
    });
});

describe('Equivalence: shellGetProblemAreas', () => {
    it('produces same output as original shell implementation', () => {
        const stats = {
            'Good':    { attempts: 10, mistakes: 1 },   // 0.1 - excluded
            'Bad':     { attempts: 10, mistakes: 5 },   // 0.5 - included
            'Awful':   { attempts: 10, mistakes: 9 },   // 0.9 - included
            'Edge':    { attempts: 10, mistakes: 3 },   // 0.3 - excluded (not >0.3)
            'JustBad': { attempts: 10, mistakes: 4 }    // 0.4 - included
        };
        const result = getGenericMistakeAreas(stats);
        assertEqual(result.length, 3);
        assertEqual(result[0].key, 'Awful');
        assertEqual(result[1].key, 'Bad');
        assertEqual(result[2].key, 'JustBad');
    });
});

describe('Equivalence: bebopGetProblemAreas', () => {
    it('limits to 5 results like original', () => {
        const stats = {};
        for (let i = 0; i < 10; i++) {
            stats[`Scale${i}`] = { attempts: 10, mistakes: 5 + i * 0.1 };
        }
        const result = getGenericMistakeAreas(stats);
        assertEqual(result.length, 5);
    });
});

describe('Equivalence: pentGetProblemAreas (avgTimeThreshold)', () => {
    it('includes slow items even with low mistake rate', () => {
        const stats = {
            'AccurateSlow': { attempts: 10, mistakes: 1, times: [4, 4, 4, 4, 4] },  // mistakeRate 0.1, avg 4 > 3
            'FastWrong':    { attempts: 10, mistakes: 5, times: [1, 1, 1] },         // mistakeRate 0.5 > 0.3
            'Perfect':      { attempts: 10, mistakes: 0, times: [1, 1, 1, 1, 1] }   // excluded
        };
        const result = getGenericMistakeAreas(stats, 2, { avgTimeThreshold: 3 });
        assertEqual(result.length, 2);
        // Sorted by mistakeRate desc: FastWrong (0.5) then AccurateSlow (0.1)
        assertEqual(result[0].key, 'FastWrong');
        assertEqual(result[1].key, 'AccurateSlow');
    });
});

describe('Equivalence: updateGenericCumulativeStats matches intUpdateCumulativeStats', () => {
    it('accumulates in the same way as the original', () => {
        resetMocks();
        const cumulative = {
            'C Minor 3rd': { attempts: 5, firstTry: 4, totalTime: 7.5, slow: 1 }
        };
        const session = {
            'C Minor 3rd': { total: 3, firstTry: 2, times: [1.2, 1.5, 2.3], slow: 1 },
            'D Major 3rd': { total: 2, firstTry: 2, times: [0.8, 0.9], slow: 0 }
        };
        updateGenericCumulativeStats('intervalCumulativeStats', session, cumulative);

        assertEqual(cumulative['C Minor 3rd'].attempts, 8);
        assertEqual(cumulative['C Minor 3rd'].firstTry, 6);
        assertApprox(cumulative['C Minor 3rd'].totalTime, 12.5, 0.001);
        assertEqual(cumulative['C Minor 3rd'].slow, 2);

        assertEqual(cumulative['D Major 3rd'].attempts, 2);
        assertEqual(cumulative['D Major 3rd'].firstTry, 2);
        assertApprox(cumulative['D Major 3rd'].totalTime, 1.7, 0.001);
        assertEqual(cumulative['D Major 3rd'].slow, 0);

        // Verify localStorage
        const saved = JSON.parse(localStorage.getItem('intervalCumulativeStats'));
        assertEqual(saved['C Minor 3rd'].attempts, 8);
        assertEqual(saved['D Major 3rd'].attempts, 2);
    });
});

describe('Equivalence: updateMistakeCumulativeStats matches shellUpdateCumulativeStats', () => {
    it('accumulates in the same way as the original', () => {
        resetMocks();
        const cumulative = {
            'C dom7': { attempts: 8, mistakes: 2 }
        };
        const session = {
            'C dom7': { attempts: 4, mistakes: 1 },
            'D m7':   { attempts: 3, mistakes: 0 }
        };
        updateMistakeCumulativeStats('shell_cumulativeStats', session, cumulative);

        assertEqual(cumulative['C dom7'].attempts, 12);
        assertEqual(cumulative['C dom7'].mistakes, 3);
        assertEqual(cumulative['D m7'].attempts, 3);
        assertEqual(cumulative['D m7'].mistakes, 0);

        const saved = JSON.parse(localStorage.getItem('shell_cumulativeStats'));
        assertEqual(saved['C dom7'].attempts, 12);
    });
});

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n\x1b[1m  Results: ${_passed}/${_total} passed\x1b[0m`);
if (_failed > 0) {
    console.log(`\x1b[31m  ${_failed} FAILED\x1b[0m\n`);
    process.exit(1);
} else {
    console.log(`\x1b[32m  All tests passed!\x1b[0m\n`);
    process.exit(0);
}
