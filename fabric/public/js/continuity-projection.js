/* AIOS Iliski Yuzeyi icin saf devamlılik projeksiyonu.
   Yeni profile veya sohbet hafizasina yazmaz: mevcut kalici kayitlari sadece
   kullanicinin "nerede kaldik" sorusuna cevap verecek sekilde birlestirir. */

const OPEN = new Set(["running", "optimistic", "pending"]);

function newest(items, key) {
  return [...(items || [])]
    .filter((item) => Number.isFinite(Number(item?.[key])))
    .sort((left, right) => Number(right[key]) - Number(left[key]))[0] || null;
}

export function continuityProjection({ artifacts = [], applications = [], tasks = [] } = {}) {
  const activeTasks = tasks.filter((task) => OPEN.has(task?.status));
  const failedTasks = tasks.filter((task) => task?.status === "failed");
  return {
    recentApplication: newest(applications, "lastOpenedAt"),
    recentArtifact: newest(artifacts, "createdAt"),
    pinnedArtifacts: artifacts.filter((artifact) => artifact?.pinned).slice(0, 3),
    activeTasks: activeTasks.slice(0, 3),
    failedTasks: failedTasks.slice(0, 3),
  };
}
