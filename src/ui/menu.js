"use strict";

const { COLORS, colorize } = require("./colors");

function isInteractiveTty(input = process.stdin, output = process.stdout) {
  return Boolean(input && input.isTTY && output && output.isTTY);
}

function createRenderer(output = process.stdout) {
  function write(text) {
    output.write(text);
  }

  function clear() {
    write("\x1b[2J\x1b[H");
  }

  function hideCursor() {
    write("\x1b[?25l");
  }

  function showCursor() {
    write("\x1b[?25h");
  }

  function render(lines) {
    clear();
    write(`${lines.join("\n")}\n`);
  }

  return {
    hideCursor,
    render,
    showCursor,
  };
}

function clampIndex(index, size) {
  if (size <= 0) return 0;
  if (index < 0) return 0;
  if (index >= size) return size - 1;
  return index;
}

function parseKey(chunk) {
  const value = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
  if (!value) return "";
  return value;
}

function wrapSelectable(items, index) {
  if (!items.length) return 0;
  if (index < 0) return items.length - 1;
  if (index >= items.length) return 0;
  return index;
}

function normalizeMultiOption(item) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const value = String(item.value || "").trim();
    if (!value) return null;
    const label = String(item.label || value);
    return { value, label };
  }

  const value = String(item || "").trim();
  if (!value) return null;
  return { value, label: value };
}

function normalizeMultiOptions(items) {
  const options = [];
  for (const item of Array.isArray(items) ? items : []) {
    const normalized = normalizeMultiOption(item);
    if (!normalized) continue;
    options.push(normalized);
  }
  return options;
}

function drawSingleLines({ hint, index, items, title }) {
  const lines = [];
  if (title) lines.push(title);
  lines.push("");
  for (let i = 0; i < items.length; i += 1) {
    const pointer = i === index ? colorize(">", COLORS.orange) : " ";
    lines.push(`${pointer} ${items[i]}`);
  }
  lines.push("");
  lines.push(colorize(hint || "Use ↑/↓ then Enter. Esc/q cancels.", COLORS.dim));
  return lines;
}

function drawMultiLines({ hint, index, items, selected, title }) {
  const lines = [];
  if (title) lines.push(title);
  lines.push("");
  for (let i = 0; i < items.length; i += 1) {
    const pointer = i === index ? colorize(">", COLORS.orange) : " ";
    const mark = selected.has(items[i].value) ? "[x]" : "[ ]";
    lines.push(`${pointer} ${mark} ${items[i].label}`);
  }
  lines.push("");
  lines.push(colorize(hint || "↑/↓ move  space toggle  a all  n none  enter confirm  q cancel", COLORS.dim));
  return lines;
}

function createMenuApi(overrides = {}) {
  const input = overrides.input || process.stdin;
  const output = overrides.output || process.stdout;
  const renderer = createRenderer(output);

  async function selectSingle({ hint = "", initialIndex = 0, items = [], title = "" } = {}) {
    const values = Array.isArray(items) ? items.slice() : [];
    if (!values.length) return { cancelled: true, index: -1, value: "" };
    if (!isInteractiveTty(input, output)) {
      return { cancelled: true, index: -1, value: "" };
    }

    let resolved = false;
    let selectedIndex = clampIndex(initialIndex, values.length);
    const previousRawMode = typeof input.isRaw === "boolean" ? input.isRaw : false;

    return new Promise((resolve) => {
      function cleanup(result) {
        if (resolved) return;
        resolved = true;
        input.off("data", onData);
        try {
          if (typeof input.setRawMode === "function") {
            input.setRawMode(previousRawMode);
          }
        } catch {
          // Ignore terminal restore errors.
        }
        renderer.showCursor();
        output.write("\n");
        resolve(result);
      }

      function redraw() {
        renderer.render(
          drawSingleLines({
            hint,
            index: selectedIndex,
            items: values,
            title,
          })
        );
      }

      function onData(chunk) {
        const key = parseKey(chunk);
        if (key === "\u0003") {
          cleanup({ cancelled: true, index: -1, value: "" });
          return;
        }
        if (key === "\u001b" || key.toLowerCase() === "q") {
          cleanup({ cancelled: true, index: -1, value: "" });
          return;
        }
        if (key === "\r" || key === "\n") {
          cleanup({
            cancelled: false,
            index: selectedIndex,
            value: values[selectedIndex],
          });
          return;
        }
        if (key === "\u001b[A" || key.toLowerCase() === "k") {
          selectedIndex = wrapSelectable(values, selectedIndex - 1);
          redraw();
          return;
        }
        if (key === "\u001b[B" || key.toLowerCase() === "j") {
          selectedIndex = wrapSelectable(values, selectedIndex + 1);
          redraw();
        }
      }

      try {
        input.resume();
        if (typeof input.setRawMode === "function") {
          input.setRawMode(true);
        }
      } catch {
        cleanup({ cancelled: true, index: -1, value: "" });
        return;
      }

      renderer.hideCursor();
      redraw();
      input.on("data", onData);
    });
  }

  async function selectMultiple({
    hint = "",
    initialIndex = 0,
    initialSelected = [],
    items = [],
    title = "",
  } = {}) {
    const options = normalizeMultiOptions(items);
    if (!options.length) return { cancelled: true, selected: [] };
    if (!isInteractiveTty(input, output)) {
      return { cancelled: true, selected: [] };
    }

    const values = options.map((option) => option.value);
    let resolved = false;
    let selectedIndex = clampIndex(initialIndex, options.length);
    const selected = new Set(
      (Array.isArray(initialSelected) ? initialSelected : []).filter((item) =>
        values.includes(item)
      )
    );
    const previousRawMode = typeof input.isRaw === "boolean" ? input.isRaw : false;

    return new Promise((resolve) => {
      function cleanup(result) {
        if (resolved) return;
        resolved = true;
        input.off("data", onData);
        try {
          if (typeof input.setRawMode === "function") {
            input.setRawMode(previousRawMode);
          }
        } catch {
          // Ignore terminal restore errors.
        }
        renderer.showCursor();
        output.write("\n");
        resolve(result);
      }

      function redraw() {
        renderer.render(
          drawMultiLines({
            hint,
            index: selectedIndex,
            items: options,
            selected,
            title,
          })
        );
      }

      function toggleCurrent() {
        const current = values[selectedIndex];
        if (selected.has(current)) selected.delete(current);
        else selected.add(current);
      }

      function onData(chunk) {
        const key = parseKey(chunk);
        if (key === "\u0003") {
          cleanup({ cancelled: true, selected: [] });
          return;
        }
        if (key === "\u001b" || key.toLowerCase() === "q") {
          cleanup({ cancelled: true, selected: [] });
          return;
        }
        if (key === "\r" || key === "\n") {
          cleanup({
            cancelled: false,
            selected: values.filter((item) => selected.has(item)),
          });
          return;
        }
        if (key === " ") {
          toggleCurrent();
          redraw();
          return;
        }
        if (key === "\u001b[A" || key.toLowerCase() === "k") {
          selectedIndex = wrapSelectable(values, selectedIndex - 1);
          redraw();
          return;
        }
        if (key === "\u001b[B" || key.toLowerCase() === "j") {
          selectedIndex = wrapSelectable(values, selectedIndex + 1);
          redraw();
          return;
        }
        if (key.toLowerCase() === "a") {
          selected.clear();
          for (const value of values) {
            selected.add(value);
          }
          redraw();
          return;
        }
        if (key.toLowerCase() === "n") {
          selected.clear();
          redraw();
        }
      }

      try {
        input.resume();
        if (typeof input.setRawMode === "function") {
          input.setRawMode(true);
        }
      } catch {
        cleanup({ cancelled: true, selected: [] });
        return;
      }

      renderer.hideCursor();
      redraw();
      input.on("data", onData);
    });
  }

  return {
    selectMultiple,
    selectSingle,
  };
}

const menuApi = createMenuApi();

module.exports = {
  createMenuApi,
  ...menuApi,
};
