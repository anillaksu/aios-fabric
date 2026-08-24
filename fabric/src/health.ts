// system.health capability'sinin SAF (I/O-suz) mantigi.
//
// Kaynak: nexus_aios/checkpoint-6-hermes-hardening'deki agent_health_check
// fikri - ama fabric'in kendi mimarisine (kurulum fisi/receipt YOK, dagitim
// dogrulamasi zaten scripts/deploy-to-phone.sh'in md5 karsilastirmasiyla
// yapiliyor) uyacak sekilde YENIDEN tasarlandi: receipt dosyasi OKUMAK
// yerine CANLI calisma-zamani gerceğini (node surumu, disk/bellek/cpu,
// fabric dizininin yazilabilirligi) dogrudan degerlendirir. Boylece ayri
// bir kurulum-zamani adima ("receipt yaz") ihtiyac yok - capability her
// cagrildiginda o anki gercek durumu raporlar.
//
// computeHealth SAF/senkron tutuluyor (fs/os okumasi execute() sarmalayicisinda
// yapilir) ki test sentetik girdilerle, gercek disk/CPU'ya dokunmadan
// calisabilsin - ayni ayrim nexus_aios'taki discovery/health.ts'te de vardi.

export type HealthStatus = "HEALTHY" | "DEGRADED" | "UNHEALTHY";

export interface HealthInputs {
  nodeVersion: string;       // process.version, ör "v26.4.0"
  requiredNodeMajor: number; // README: "node --version # >= 22.6"
  requiredNodeMinor: number;
  fabricDirWritable: boolean;
  memUsedPercent: number;
  cpuLoadRatio: number;      // loadavg[0] / cpuCount - HAM oran (0.9 = %90)
  diskAvailableMB?: number;
}

export interface HealthResult {
  status: HealthStatus;
  checks: Record<string, unknown>;
  error?: string;
}

const LOW_DISK_THRESHOLD_MB = 100;
const HIGH_MEM_THRESHOLD_PERCENT = 95;
const HIGH_CPU_LOAD_RATIO = 0.9;

function parseNodeVersion(v: string): { major: number; minor: number } {
  const m = v.replace(/^v/, "").match(/^(\d+)\.(\d+)/);
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : { major: 0, minor: 0 };
}

export function computeHealth(inputs: HealthInputs): HealthResult {
  const { major, minor } = parseNodeVersion(inputs.nodeVersion);
  const nodeOk = major > inputs.requiredNodeMajor || (major === inputs.requiredNodeMajor && minor >= inputs.requiredNodeMinor);

  const checks = {
    node_version: inputs.nodeVersion,
    node_version_ok: nodeOk,
    fabric_dir_writable: inputs.fabricDirWritable,
    cpu_usage: `${Math.round(inputs.cpuLoadRatio * 100)}%`,
    memory_usage: `${inputs.memUsedPercent}%`,
    disk_available: inputs.diskAvailableMB !== undefined ? `${inputs.diskAvailableMB} MB` : "unknown",
  };

  let status: HealthStatus = "HEALTHY";
  if (!nodeOk || !inputs.fabricDirWritable || inputs.memUsedPercent > HIGH_MEM_THRESHOLD_PERCENT || inputs.cpuLoadRatio > HIGH_CPU_LOAD_RATIO) {
    status = "DEGRADED";
  }
  let error: string | undefined;
  if (inputs.diskAvailableMB !== undefined && inputs.diskAvailableMB < LOW_DISK_THRESHOLD_MB) {
    status = "UNHEALTHY";
    error = "Kritik seviyede dusuk disk alani (<100MB).";
  }
  if (!inputs.fabricDirWritable) {
    status = "UNHEALTHY";
    error = "fabric calisma dizini yazilabilir degil - journal/state yazamaz.";
  }
  return error ? { status, checks, error } : { status, checks };
}
