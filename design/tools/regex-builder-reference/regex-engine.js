(function registerRegexBuilderEngine(root, factory) {
  const engine = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = engine;
  } else {
    root.RegexBuilderEngine = engine;
  }
})(typeof self !== "undefined" ? self : globalThis, function createRegexBuilderEngine() {
  "use strict";

  const MAX_PATTERN_LENGTH = 2000;
  const MAX_SAMPLE_LENGTH = 20000;
  const MAX_MATCHES = 500;

  function advanceStringIndex(value, index, unicode) {
    if (!unicode || index + 1 >= value.length) {
      return index + 1;
    }

    const first = value.charCodeAt(index);
    if (first < 0xd800 || first > 0xdbff) {
      return index + 1;
    }

    const second = value.charCodeAt(index + 1);
    return second >= 0xdc00 && second <= 0xdfff ? index + 2 : index + 1;
  }

  function assertInputLimits(pattern, sample) {
    if (pattern.length > MAX_PATTERN_LENGTH) {
      throw new RangeError(`Pattern exceeds ${MAX_PATTERN_LENGTH} characters.`);
    }
    if (sample.length > MAX_SAMPLE_LENGTH) {
      throw new RangeError(`Sample exceeds ${MAX_SAMPLE_LENGTH} characters.`);
    }
  }

  function runRegex({ pattern, flags, sample, maxMatches = MAX_MATCHES }) {
    if (typeof pattern !== "string" || typeof flags !== "string" || typeof sample !== "string") {
      throw new TypeError("Pattern, flags, and sample must be strings.");
    }
    if (!Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > MAX_MATCHES) {
      throw new RangeError(`Match limit must be between 1 and ${MAX_MATCHES}.`);
    }

    assertInputLimits(pattern, sample);
    const expression = new RegExp(pattern, flags);
    const matches = [];
    let truncated = false;

    while (true) {
      const match = expression.exec(sample);
      if (match === null) {
        break;
      }

      matches.push({
        index: match.index,
        end: match.index + match[0].length,
        value: match[0],
        captures: match.slice(1).map((capture) => (capture === undefined ? null : capture)),
        namedGroups: match.groups ? { ...match.groups } : {},
      });

      if (matches.length > maxMatches) {
        matches.pop();
        truncated = true;
        break;
      }

      if (!expression.global) {
        break;
      }

      if (match[0] === "") {
        expression.lastIndex = advanceStringIndex(
          sample,
          expression.lastIndex,
          expression.unicode || expression.unicodeSets,
        );
      }
    }

    return {
      matches,
      truncated,
      source: expression.source,
      flags: expression.flags,
    };
  }

  return {
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_SAMPLE_LENGTH,
    advanceStringIndex,
    runRegex,
  };
});
