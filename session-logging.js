/**
 * Session Logging Infrastructure (roa.1 stub)
 *
 * This file provides the core session logging infrastructure for capturing
 * practice session data. It serves as a dependency for MIDI handler instrumentation (roa.2).
 */

// ==================== GLOBAL STATE ====================

// Master enable flag for session logging
var sessionLogEnabled = false;

// Array of all completed sessions
var sessionLogSessions = [];

// Current active session (null when no session is active)
var currentSessionLog = null;

// Current active round within a session (null when no round in progress)
var currentRoundLog = null;

// Timestamp when current round started (for calculating offsetMs)
var roundStartTime = null;


// ==================== CORE FUNCTIONS ====================

/**
 * Record a MIDI event during an active round
 *
 * @param {string} type - 'noteOn' or 'noteOff'
 * @param {number} midi - MIDI note number (0-127)
 * @param {number} velocity - MIDI velocity (0-127)
 */
function sessionLogRecordEvent(type, midi, velocity) {
    // Guards: only record when logging is fully active
    if (!sessionLogEnabled || !currentSessionLog || !currentRoundLog || !roundStartTime) {
        return;
    }

    const pitchClass = midi % 12;

    // Calculate isCorrect: only for noteOn events when expectedPitchClasses is available
    let isCorrect = null;
    if (type === 'noteOn' && currentRoundLog.expectedPitchClasses) {
        isCorrect = currentRoundLog.expectedPitchClasses.includes(pitchClass);
    }

    const event = {
        type: type,
        midi: midi,
        pitchClass: pitchClass,
        velocity: velocity || 0,
        offsetMs: Date.now() - roundStartTime,
        isCorrect: isCorrect
    };

    currentRoundLog.events.push(event);
}

/**
 * Start a new logging session
 *
 * @param {string} mode - The practice mode (e.g., 'chords', 'scales')
 * @param {object} config - Mode-specific configuration
 */
function sessionLogStartSession(mode, config) {
    if (!sessionLogEnabled) return;

    currentSessionLog = {
        mode: mode,
        config: config || {},
        startTime: Date.now(),
        rounds: []
    };
}

/**
 * Start a new round within the current session
 *
 * @param {object} challenge - The challenge object for this round
 */
function sessionLogStartRound(challenge) {
    if (!sessionLogEnabled || !currentSessionLog) return;

    // Extract expected pitch classes based on challenge structure
    const expectedPitchClasses = sessionLogExtractExpectedPitchClasses(challenge);

    currentRoundLog = {
        challenge: challenge,
        expectedPitchClasses: expectedPitchClasses,
        events: [],
        startTime: Date.now()
    };

    roundStartTime = Date.now();
}

/**
 * End the current round
 *
 * @param {object} result - Result data for the round
 */
function sessionLogEndRound(result) {
    if (!sessionLogEnabled || !currentSessionLog || !currentRoundLog) return;

    currentRoundLog.endTime = Date.now();
    currentRoundLog.result = result || {};
    currentRoundLog.durationMs = currentRoundLog.endTime - currentRoundLog.startTime;

    currentSessionLog.rounds.push(currentRoundLog);
    currentRoundLog = null;
    roundStartTime = null;
}

/**
 * End the current session
 */
function sessionLogEndSession() {
    if (!sessionLogEnabled || !currentSessionLog) return;

    currentSessionLog.endTime = Date.now();
    currentSessionLog.durationMs = currentSessionLog.endTime - currentSessionLog.startTime;

    sessionLogSessions.push(currentSessionLog);
    sessionLogSaveToStorage();

    currentSessionLog = null;
    currentRoundLog = null;
    roundStartTime = null;

    // Update UI if available
    if (typeof updateSessionLogUI === 'function') {
        updateSessionLogUI();
    }
}

/**
 * Extract expected pitch classes from a challenge object
 * Normalizes different challenge structures across modes
 *
 * @param {object} challenge - The challenge object
 * @returns {number[]|null} Array of pitch classes (0-11) or null
 */
function sessionLogExtractExpectedPitchClasses(challenge) {
    if (!challenge) return null;

    // Direct array
    if (Array.isArray(challenge.expectedPitchClasses)) {
        return challenge.expectedPitchClasses;
    }

    // Chord modes: requiredPitchClasses (Set or Array)
    if (challenge.requiredPitchClasses) {
        if (challenge.requiredPitchClasses instanceof Set) {
            return Array.from(challenge.requiredPitchClasses);
        }
        return challenge.requiredPitchClasses;
    }

    // Interval mode: targetMidi
    if (typeof challenge.targetMidi === 'number') {
        return [challenge.targetMidi % 12];
    }

    // Full pitch classes (tritone, voiceleading)
    if (challenge.fullPitchClasses instanceof Set) {
        return Array.from(challenge.fullPitchClasses);
    }

    // Shell pitch classes
    if (challenge.shellPitchClasses instanceof Set) {
        return Array.from(challenge.shellPitchClasses);
    }

    // Target chord pitch classes
    if (challenge.targetChord && challenge.targetChord.pitchClasses) {
        if (challenge.targetChord.pitchClasses instanceof Set) {
            return Array.from(challenge.targetChord.pitchClasses);
        }
        return challenge.targetChord.pitchClasses;
    }

    // Direct pitchClasses (dom7v voicings)
    if (challenge.pitchClasses instanceof Set) {
        return Array.from(challenge.pitchClasses);
    }

    // Scale modes: expectedNotes (pent, bebop)
    if (Array.isArray(challenge.expectedNotes)) {
        return challenge.expectedNotes;
    }

    return null;
}

/**
 * Save sessions to localStorage
 */
function sessionLogSaveToStorage() {
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('sessionLogData', JSON.stringify(sessionLogSessions));
        }
    } catch (e) {
        console.warn('Failed to save session log data:', e);
    }
}

/**
 * Load sessions from localStorage
 */
function sessionLogLoadFromStorage() {
    try {
        if (typeof localStorage !== 'undefined') {
            const data = localStorage.getItem('sessionLogData');
            if (data) {
                const parsed = JSON.parse(data);
                // Ensure it's an array (guard against corrupted/old format data)
                sessionLogSessions = Array.isArray(parsed) ? parsed : [];
            }
        }
    } catch (e) {
        console.warn('Failed to load session log data:', e);
        sessionLogSessions = [];
    }
}

/**
 * Clear all session data
 */
function sessionLogClear() {
    sessionLogSessions = [];
    currentSessionLog = null;
    currentRoundLog = null;
    roundStartTime = null;
    if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('sessionLogData');
    }
}

// ==================== JSON EXPORT ====================

/**
 * Export all session data as JSON file download
 */
function exportSessionLogJSON() {
    var exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        sessionCount: sessionLogSessions.length,
        sessions: sessionLogSessions
    };

    var jsonString = JSON.stringify(exportData, null, 2);
    var blob = new Blob([jsonString], { type: 'application/json' });
    var date = new Date().toISOString().split('T')[0];
    var filename = 'piano-tutor-sessions-' + date + '.json';

    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Initialize on load
sessionLogLoadFromStorage();
