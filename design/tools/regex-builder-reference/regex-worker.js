"use strict";

importScripts("./regex-engine.js");

self.addEventListener("message", (event) => {
  const { id, pattern, flags, sample } = event.data;

  try {
    const result = self.RegexBuilderEngine.runRegex({ pattern, flags, sample });
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
