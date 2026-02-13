"use strict";

const { COLORS, COLOR_ENABLED, colorize } = require("./colors");

/**
 * Icons for consistent UI
 */
const ICONS = {
    success: "✓",
    error: "✗",
    warning: "⚠",
    info: "ℹ",
    running: "●",
    stopped: "○",
    arrow: "→",
    bullet: "•",
    dot: "·",
};

/**
 * Spinner frames (braille dots)
 */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Creative spinner verbs (Claude Code style)
 */
const SPINNER_VERBS = [
    "Working",
    "Processing",
    "Connecting",
    "Preparing",
    "Initializing",
    "Warming up",
    "Loading",
];

/**
 * Check if animations should be enabled
 */
const ANIMATIONS_ENABLED = (() => {
    if (process.env.DROXY_NO_ANIMATION === "1") return false;
    if (process.env.CI === "1" || process.env.CI === "true") return false;
    return process.stdout.isTTY === true;
})();

/**
 * Sleep for a number of milliseconds
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a duration in milliseconds to human-readable string
 */
function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }
    if (ms < 86400000) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        return `${hours}h ${minutes}m`;
    }
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    return `${days}d ${hours}h`;
}

/**
 * Spinner class for showing loading animations
 */
class Spinner {
    constructor(text = "") {
        this.text = text;
        this.frames = SPINNER_FRAMES;
        this.interval = null;
        this.frameIndex = 0;
        this.startTime = null;
    }

    start() {
        if (this.interval) return this;
        if (!ANIMATIONS_ENABLED) {
            process.stdout.write(`${this.text}\n`);
            return this;
        }

        this.startTime = Date.now();
        process.stdout.write("\x1B[?25l"); // Hide cursor

        this.interval = setInterval(() => {
            const frame = this.frames[this.frameIndex];
            const elapsedMs = this.startTime ? Date.now() - this.startTime : 0;
            const elapsedText = elapsedMs >= 2000
                ? ` ${colorize(`(${formatDuration(elapsedMs)})`, COLORS.dim)}`
                : "";
            process.stdout.write(`\r${colorize(frame, COLORS.orange)} ${this.text}${elapsedText}\x1b[K`);
            this.frameIndex = (this.frameIndex + 1) % this.frames.length;
        }, 80);

        return this;
    }

    setText(text) {
        this.text = text;
        return this;
    }

    stop(finalMsg, success = true) {
        const duration = this.startTime ? Date.now() - this.startTime : 0;

        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }

        const symbol = success ? ICONS.success : ICONS.error;
        const color = success ? COLORS.success : COLORS.error;
        const durationText = duration > 500 ? ` ${colorize(`(${formatDuration(duration)})`, COLORS.dim)}` : "";

        if (ANIMATIONS_ENABLED) {
            process.stdout.write(`\r${colorize(symbol, color)} ${finalMsg || this.text}${durationText}\x1b[K\n`);
            process.stdout.write("\x1B[?25h"); // Show cursor
        } else {
            process.stdout.write(`${symbol} ${finalMsg || this.text}${durationText}\n`);
        }

        return this;
    }

    succeed(msg) {
        return this.stop(msg, true);
    }

    fail(msg) {
        return this.stop(msg, false);
    }
}

/**
 * Run an async function with a spinner
 */
async function withSpinner(text, fn) {
    const spinner = new Spinner(text).start();
    try {
        const result = await fn(spinner);
        spinner.succeed();
        return result;
    } catch (err) {
        spinner.fail(err.message || text);
        throw err;
    }
}

/**
 * Run an async function and display duration
 */
async function withTiming(label, fn) {
    const start = Date.now();
    const result = await fn();
    const duration = formatDuration(Date.now() - start);
    process.stdout.write(`${colorize(ICONS.success, COLORS.success)} ${label} ${colorize(`(${duration})`, COLORS.dim)}\n`);
    return result;
}

/**
 * Typewriter effect for text
 */
async function typewriter(text, delayMs = 30) {
    if (!ANIMATIONS_ENABLED) {
        process.stdout.write(text + "\n");
        return;
    }
    for (const char of text) {
        process.stdout.write(char);
        await sleep(delayMs);
    }
    process.stdout.write("\n");
}

/**
 * Step progress indicator
 */
class StepProgress {
    constructor(steps, title = "") {
        this.steps = steps;
        this.current = 0;
        this.title = title;
    }

    next(label) {
        this.current++;
        const total = this.steps.length;
        const icon = colorize(ICONS.success, COLORS.success);
        const step = colorize(`${this.current}/${total}`, COLORS.dim);
        process.stdout.write(`${icon} Step ${step}: ${label}\n`);
        return this;
    }

    pending(label) {
        const total = this.steps.length;
        const stepNum = this.current + 1;
        const icon = colorize("◌", COLORS.orange);
        const step = colorize(`${stepNum}/${total}`, COLORS.dim);
        process.stdout.write(`${icon} Step ${step}: ${label}\n`);
        return this;
    }

    remaining() {
        const remaining = this.steps.slice(this.current);
        for (const step of remaining) {
            const total = this.steps.length;
            const stepNum = this.steps.indexOf(step) + 1;
            const icon = colorize("○", COLORS.dim);
            const stepLabel = colorize(`${stepNum}/${total}`, COLORS.dim);
            process.stdout.write(`${icon} Step ${stepLabel}: ${colorize(step, COLORS.dim)}\n`);
        }
        return this;
    }
}

module.exports = {
    ICONS,
    SPINNER_FRAMES,
    SPINNER_VERBS,
    ANIMATIONS_ENABLED,
    sleep,
    formatDuration,
    Spinner,
    withSpinner,
    withTiming,
    typewriter,
    StepProgress,
};
