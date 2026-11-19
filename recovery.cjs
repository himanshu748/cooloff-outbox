function nextRecovery(code, message, excluded, types) {
  if (Number(code) !== 8) return null;
  const candidates = /expressions-inference/i.test(message)
    ? [types.EXPRESSIONS]
    : /phasic-bp-inference/i.test(message)
      ? [types.ARTERIAL_PRESSURE_TRACE]
      : [types.ARTERIAL_PRESSURE_TRACE, types.EXPRESSIONS];
  const metric = candidates.find((value) => !excluded.includes(value));
  return metric === undefined ? null : [...excluded, metric];
}

module.exports = { nextRecovery };
