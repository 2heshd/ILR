export type CloudSyncFailure = {
  area: "history" | "vocabulary";
  reason: unknown;
};

function errorText(reason: unknown) {
  if (reason && typeof reason === "object") {
    const value = reason as { code?: unknown; message?: unknown; status?: unknown };
    return [value.code, value.message, value.status]
      .filter((part) => part !== undefined && part !== null)
      .join(" ")
      .toLowerCase();
  }
  return String(reason ?? "").toLowerCase();
}

/**
 * Connection failures are expected to recover on the next debounced save. They
 * should be logged, but never interrupt a flashcard session with a toast.
 */
export function isRetryableCloudSyncFailure(reason: unknown) {
  const text = errorText(reason);
  if (!text) return true;
  return /network|fetch|offline|timeout|timed out|abort|connection|econn|socket|\b408\b|\b425\b|\b429\b|\b5\d\d\b/.test(text);
}

export function actionableCloudSyncNotice(failures: CloudSyncFailure[]) {
  const actionable = failures.filter(({ reason }) => !isRetryableCloudSyncFailure(reason));
  if (!actionable.length) return null;
  const areas = [...new Set(actionable.map(({ area }) => area === "history" ? "History" : "Shared vocabulary"))];
  return `${areas.join(" and ")} cloud sync needs attention. Local progress is safe on this device.`;
}
