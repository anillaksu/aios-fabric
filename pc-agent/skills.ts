// PC ajaninin GERCEK yetenekleri.
//
// ═══ 2026-08-17: STUB'DAN GERCEGE ═══
// Onceki surumde yalnizca system.info + fs.list vardi, serbest metin ise
// echo'lanıyordu ("bu peer'in arkasinda model YOK"). Telefondaki Hermes
// calisiyor (Codex OAuth -> gpt-5.6-luna) ama PC'nin model saglayicisi
// (omniroute :20128) KAPALI - yani "iki model karsilikli konussun" bugun
// mumkun degil.
//
// DOGRU MIMARI ZATEN BU DEGILDI: PC'ye ikinci bir beyin koymak yerine PC'yi
// ARAC TARAFINA koymak, kullanicinin kendi yol haritasindaki "capability-based
// routing" maddesiyle birebir ortusuyor:
//     cihaz secme -> YETENEK sec
// Telefondaki Hermes dusunur; PC'de yapilmasi gereken isi (dosya okuma,
// komut calistirma, git durumu) buraya delege eder. Tek beyin, iki govde.
//
// GUVENLIK: bu uc, Tailscale agindaki cihazlara ACIK bir kabuk demek. Telefonda
// `script.run` icin ogrenilen dersler burada da uygulaniyor:
//   · yikici kalip listesi        (rm -rf /, format, shutdown...)
//   · calisma dizini kisitli      (SAFE_ROOT disina cikilamaz)
//   · ciktilar kirpilir           (bellek/aktarim patlamasin)
//   · her cagri stdout'a loglanir (gorunurluk)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hostname, uptime, platform, cpus, totalmem, freemem } from "node:os";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";

const execFileAsync = promisify(execFile);

export const SAFE_ROOT = resolve(process.env.PC_AGENT_SAFE_ROOT ?? process.cwd());

/** SAFE_ROOT disina cikan yollari reddeder (yol kacisi korumasi). */
function safePath(p: string): string {
  const full = isAbsolute(p) ? resolve(p) : resolve(SAFE_ROOT, p);
  const rel = relative(SAFE_ROOT, full);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`yol SAFE_ROOT disinda: ${p} (kok: ${SAFE_ROOT})`);
  }
  return full;
}

const DANGEROUS = [
  /\brm\s+-rf\s+[/~]/i,
  /\bformat\s+[a-z]:/i,
  /\b(shutdown|reboot|restart-computer)\b/i,
  /\bdel\s+\/[sq]\b/i,
  /\bRemove-Item\b[^|;]*-Recurse[^|;]*[/\\]\s*$/i,
  /\bmkfs\b/i,
  /\bdd\s+if=.*of=\/dev\//i,
  /\breg\s+delete\b/i,
  /\bnet\s+user\b.*\/(add|delete)/i,
];

export interface SkillResult {
  ok: boolean;
  output: string;
}

export const SKILLS = {
  "system.info": {
    description: "PC'nin OS/CPU/bellek/uptime bilgisi",
    run: async (): Promise<SkillResult> => {
      const mb = (n: number) => Math.round(n / 1024 / 1024);
      return {
        ok: true,
        output: JSON.stringify(
          {
            hostname: hostname(),
            platform: platform(),
            uptimeSec: Math.round(uptime()),
            cpuCount: cpus().length,
            cpuModel: cpus()[0]?.model,
            totalMemMB: mb(totalmem()),
            freeMemMB: mb(freemem()),
            safeRoot: SAFE_ROOT,
          },
          null,
          2,
        ),
      };
    },
  },

  "fs.list": {
    description: "SAFE_ROOT altinda dizin listeler. arg: alt yol (istege bagli)",
    run: async (arg: string): Promise<SkillResult> => {
      try {
        const dir = safePath(arg || ".");
        const entries = readdirSync(dir).slice(0, 200).map((name) => {
          const st = statSync(join(dir, name));
          return `${st.isDirectory() ? "[D]" : "[F]"} ${name}${st.isFile() ? "  " + st.size + "b" : ""}`;
        });
        return { ok: true, output: entries.join("\n") || "(bos dizin)" };
      } catch (err) {
        return { ok: false, output: String(err instanceof Error ? err.message : err) };
      }
    },
  },

  "fs.read": {
    description: "SAFE_ROOT altinda bir dosyayi okur (ilk 60KB). arg: dosya yolu",
    run: async (arg: string): Promise<SkillResult> => {
      try {
        if (!arg) return { ok: false, output: "dosya yolu gerekli" };
        const file = safePath(arg);
        const text = readFileSync(file, "utf8");
        const clipped = text.length > 60000 ? text.slice(0, 60000) + "\n…(kirpildi)" : text;
        return { ok: true, output: clipped };
      } catch (err) {
        return { ok: false, output: String(err instanceof Error ? err.message : err) };
      }
    },
  },

  "shell.run": {
    description: "PC'de komut calistirir (SAFE_ROOT icinde, yikici kaliplar reddedilir)",
    run: async (arg: string): Promise<SkillResult> => {
      if (!arg) return { ok: false, output: "komut gerekli" };
      if (DANGEROUS.some((re) => re.test(arg))) {
        return { ok: false, output: `Reddedildi - yikici kalip: ${arg.slice(0, 80)}` };
      }
      try {
        // PowerShell: Windows'ta varsayilan kabuk. -NoProfile: kullanicinin
        // profili yan etki yapmasin. Cikti kirpilir.
        const { stdout, stderr } = await execFileAsync(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", arg],
          { cwd: SAFE_ROOT, timeout: 60000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
        );
        const out = (stdout || "").trim();
        const err = (stderr || "").trim();
        return {
          ok: true,
          output: (out.slice(0, 20000) || "(cikti yok)") + (err ? `\n[stderr] ${err.slice(0, 2000)}` : ""),
        };
      } catch (err) {
        const e = err as { message?: string; stdout?: string; stderr?: string };
        return {
          ok: false,
          output: [e.stdout, e.stderr, e.message].filter(Boolean).join("\n").slice(0, 4000),
        };
      }
    },
  },

  "git.status": {
    description: "SAFE_ROOT'taki git deposunun durumu (varsa)",
    run: async (): Promise<SkillResult> => {
      try {
        const { stdout } = await execFileAsync("git", ["status", "--short", "--branch"], {
          cwd: SAFE_ROOT, timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true,
        });
        return { ok: true, output: stdout.trim() || "(temiz)" };
      } catch (err) {
        return { ok: false, output: `git calistirilamadi: ${err instanceof Error ? err.message : err}` };
      }
    },
  },
} as const;

export type SkillName = keyof typeof SKILLS;

/**
 * Gelen serbest metni bir yetenege cozer.
 *
 * ONCELIK: ACIK "skill: <ad> | <arg>" bicimi. Anahtar-kelime tahmini
 * (eski surumun tek yolu) yalnizca YEDEK - tahmin, yanlis yetenegi
 * calistirdiginda sessizce sacma sonuc uretiyordu.
 */
export function resolveSkill(text: string): { skill: SkillName | null; arg: string } {
  const explicit = text.match(/^\s*skill:\s*([a-z.]+)\s*(?:\|\s*([\s\S]*))?$/i);
  if (explicit) {
    const name = explicit[1].toLowerCase() as SkillName;
    return { skill: name in SKILLS ? name : null, arg: (explicit[2] ?? "").trim() };
  }

  const t = text.toLowerCase();
  if (/\b(system|sistem|cpu|bellek|ram|donanim)\b/.test(t)) return { skill: "system.info", arg: "" };
  if (/\b(git|commit|branch|dal)\b/.test(t)) return { skill: "git.status", arg: "" };
  if (/\b(oku|read|icerigi|icerik)\b/.test(t)) return { skill: "fs.read", arg: "" };
  if (/\b(dosya|dizin|klasor|list|ls)\b/.test(t)) return { skill: "fs.list", arg: "" };
  return { skill: null, arg: text };
}
