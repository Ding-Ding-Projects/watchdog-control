"use strict";

self.onmessage = event => {
  const data = event.data || {};
  if (typeof data.pattern !== "string" || data.pattern.length > 256 ||
      typeof data.flags !== "string" || !Array.isArray(data.values) ||
      data.values.length > 5000) {
    self.postMessage({ error: "Search input exceeded its supported bounds." });
    return;
  }
  const allowedFlags = new Set(["d", "g", "i", "m", "s", "u", "v", "y"]);
  const seen = new Set();
  for (const flag of data.flags) {
    if (!allowedFlags.has(flag) || seen.has(flag)) {
      self.postMessage({ error: "Regular-expression flags are invalid or duplicated." });
      return;
    }
    seen.add(flag);
  }
  let expression;
  try {
    expression = new RegExp(data.pattern, data.flags);
  } catch (error) {
    self.postMessage({ error: "Invalid regular expression: " + error.message });
    return;
  }
  const start = performance.now();
  const indices = [];
  let totalLength = 0;
  for (let index = 0; index < data.values.length; index += 1) {
    const value = String(data.values[index] ?? "");
    totalLength += value.length;
    if (totalLength > 500000) {
      self.postMessage({ error: "Search data exceeded the 500,000-character limit." });
      return;
    }
    expression.lastIndex = 0;
    if (expression.test(value)) indices.push(index);
    if (performance.now() - start > 120) {
      self.postMessage({ error: "Regular-expression search exceeded its time limit." });
      return;
    }
  }
  self.postMessage({ indices });
};
