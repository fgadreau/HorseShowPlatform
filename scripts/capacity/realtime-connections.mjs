export function buildRealtimeConnectionMetrics(viewers, holdSeconds) {
  const normalizedViewers = Array.isArray(viewers) ? viewers : [];
  let recoveredReconnects = 0;
  let realtimeSocketErrors = 0;
  let realtimeStatusErrors = 0;
  let unmatchedStatusErrors = 0;
  let unrecoveredDisconnects = 0;

  for (const viewer of normalizedViewers) {
    const hasSteadyLifecycle = Object.hasOwn(viewer, "steadyRealtimeOpened");
    const opened = nonNegativeInteger(
      hasSteadyLifecycle ? viewer.steadyRealtimeOpened : viewer.realtimeOpened,
    );
    const closed = nonNegativeInteger(
      hasSteadyLifecycle ? viewer.steadyRealtimeClosed : viewer.realtimeClosed,
    );
    const statusErrors = nonNegativeInteger(
      hasSteadyLifecycle
        ? viewer.steadyRealtimeStatusErrors
        : viewer.realtimeStatusErrors,
    );
    const recoveredForViewer = Math.min(
      closed,
      hasSteadyLifecycle ? opened : Math.max(0, opened - 1),
    );

    recoveredReconnects += recoveredForViewer;
    realtimeSocketErrors += nonNegativeInteger(
      hasSteadyLifecycle ? viewer.steadyRealtimeErrors : viewer.realtimeErrors,
    );
    realtimeStatusErrors += statusErrors;
    unmatchedStatusErrors += Math.max(0, statusErrors - recoveredForViewer);
    unrecoveredDisconnects += Math.max(0, closed - recoveredForViewer);
  }

  const activeConnections = normalizedViewers.reduce(
    (total, viewer) => total + nonNegativeInteger(viewer.realtimeActive),
    0,
  );
  const expectedConnections = normalizedViewers.length;
  const holdHours = Math.max(Number(holdSeconds) / 3_600, 1 / 3_600);
  const recoveredReconnectsPerViewHour = recoveredReconnects
    / Math.max(1, expectedConnections)
    / holdHours;
  const unrecoveredFailures = realtimeSocketErrors
    + Math.max(unmatchedStatusErrors, unrecoveredDisconnects);

  return {
    activeConnections,
    expectedConnections,
    realtimeSocketErrors,
    realtimeStatusErrors,
    recoveredReconnects,
    recoveredReconnectsPerViewHour,
    unmatchedStatusErrors,
    unrecoveredDisconnects,
    unrecoveredFailures,
  };
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}
