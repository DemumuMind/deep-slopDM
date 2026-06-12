import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface ScanDiagnostic {
  rule: string;
  severity: string;
  line: number;
  column: number;
  filePath: string;
  message: string;
  help?: string;
}

export interface ScanEngine {
  engine: string;
  diagnostics: ScanDiagnostic[];
}

export interface ScanMeta {
  filesScanned: number;
  durationMs: number;
}

export interface ScanResult {
  score: number;
  totalDiagnostics: number;
  engines: ScanEngine[];
  meta: ScanMeta;
}

/**
 * Resolve the deep-slop CLI path.
 *
 * SECURITY: Only uses the user-level (Global) configuration setting.
 * Workspace/folder-level settings are explicitly ignored to prevent
 * a malicious repo from pointing the extension at a trojanized binary.
 */
export function findCliPath(): string {
  // 1. User-level config only (ConfigurationTarget.Global)
  const config = vscode.workspace.getConfiguration('deep-slop');
  const configPath = config.inspect<string>('path')?.globalValue;
  if (configPath && configPath.trim().length > 0) {
    return configPath.trim();
  }

  // 2. Search PATH
  const isWin = process.platform === 'win32';
  const cliName = isWin ? 'deep-slop.cmd' : 'deep-slop';
  const pathDirs = (process.env.PATH ?? '').split(path.delimiter);
  for (const dir of pathDirs) {
    const candidate = path.join(dir, cliName);
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }

  // 3. Fallback — just the bare name, rely on shell resolution
  return 'deep-slop';
}

/**
 * Run deep-slop scan and return parsed JSON result.
 */
export async function runScan(rootDir: string, filePath?: string): Promise<ScanResult> {
  const cli = findCliPath();

  const args = ['scan', rootDir, '--json'];
  if (filePath) {
    args.push('--file', filePath);
  }

  const stdout = await execFile(cli, args, { cwd: rootDir, maxBuffer: 50 * 1024 * 1024 });

  try {
    const parsed = JSON.parse(stdout);
    return {
      score: parsed.score ?? 0,
      totalDiagnostics: parsed.totalDiagnostics ?? 0,
      engines: parsed.engines ?? [],
      meta: parsed.meta ?? { filesScanned: 0, durationMs: 0 },
    };
  } catch (err: any) {
    throw new Error(`Failed to parse deep-slop output: ${err.message}\nOutput: ${stdout.slice(0, 500)}`);
  }
}

function execFile(
  command: string,
  args: string[],
  options: cp.ExecFileOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.execFile(command, args, options, (err, stdout, stderr) => {
      if (err) {
        const detail = stderr ? `\n${stderr.slice(0, 500)}` : '';
        reject(new Error(`deep-slop exited with code ${err.code ?? '?'}: ${err.message}${detail}`));
        return;
      }
      resolve(stdout);
    });
  });
}
