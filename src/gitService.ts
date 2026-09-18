import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { buildShowSpec, CommitInfo, FileEntry, parseLogLines, parseNameStatusZ } from './gitParse';

function getConfiguredGitPath(): string {
  const custom = vscode.workspace.getConfiguration('gitRangeDiff').get<string>('gitPath', '');
  if (custom && custom.trim()) {
    return custom.trim();
  }
  const gitExtPath = vscode.workspace.getConfiguration('git').get<string>('path', '');
  if (gitExtPath && gitExtPath.trim()) {
    return gitExtPath.trim();
  }
  return 'git';
}

function execGit(repoRoot: string, args: string[]): Promise<{ stdout: Buffer; stderr: string }> {
  const gitPath = getConfiguredGitPath();
  return new Promise((resolve, reject) => {
    execFile(
      gitPath,
      args,
      { cwd: repoRoot, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, timeout: 60000 },
      (err, stdout, stderr) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException & { code?: number }).code;
          reject(new Error(`git ${args[0]} 失敗(code=${code ?? '?'}): ${String(stderr ?? err.message).slice(0, 500)}`));
          return;
        }
        resolve({ stdout: stdout as Buffer, stderr: String(stderr ?? '') });
      }
    );
  });
}

/** ワークスペースフォルダ→gitルート。EDITOR優先→先頭フォルダ */
export async function resolveRepoRoot(): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  let candidates = folders.map((f) => f.uri.fsPath);
  const active = vscode.window.activeTextEditor?.document.uri;
  if (active?.scheme === 'file') {
    const wf = vscode.workspace.getWorkspaceFolder(active);
    if (wf) {
      candidates = [wf.uri.fsPath, ...candidates.filter((c) => c !== wf.uri.fsPath)];
    }
  }
  if (candidates.length > 1) {
    const picked = await vscode.window.showQuickPick(
      candidates.map((c) => ({ label: c })),
      { placeHolder: '比較対象のリポジトリ(ワークスペースフォルダ)を選択' }
    );
    if (!picked) {
      return undefined;
    }
    candidates = [picked.label];
  }
  try {
    const { stdout } = await execGit(candidates[0], ['rev-parse', '--show-toplevel']);
    return stdout.toString('utf8').trim().replace(/\r?\n$/, '');
  } catch {
    return undefined;
  }
}

export async function getCommits(repoRoot: string, skip: number, limit: number): Promise<CommitInfo[]> {
  const { stdout } = await execGit(repoRoot, [
    '-c',
    'core.quotepath=false',
    'log',
    `--skip=${skip}`,
    `-n`,
    `${limit}`,
    '--pretty=format:%H%x00%s%x00%an%x00%ad%x00%D',
    '--date=short',
  ]);
  return parseLogLines(stdout);
}

export async function getChangedFiles(
  repoRoot: string,
  oldRev: string,
  newRev: string,
  maxFiles: number
): Promise<{ entries: FileEntry[]; truncated: boolean }> {
  const { stdout } = await execGit(repoRoot, [
    '-c',
    'core.quotepath=false',
    'diff',
    '--name-status',
    '-z',
    '--no-color',
    oldRev,
    newRev,
    '--',
  ]);
  const all = parseNameStatusZ(stdout);
  return { entries: all.slice(0, maxFiles), truncated: all.length > maxFiles };
}

/** numstatでバイナリ( `- -` )判定 */
export async function getBinarySet(repoRoot: string, oldRev: string, newRev: string): Promise<Set<string>> {
  try {
    const { stdout } = await execGit(repoRoot, [
      '-c',
      'core.quotepath=false',
      'diff',
      '--numstat',
      '-z',
      '--no-color',
      oldRev,
      newRev,
      '--',
    ]);
    const text = stdout.toString('utf8');
    const set = new Set<string>();
    for (const rec of text.split('\0')) {
      if (!rec) {
        continue;
      }
      const fields = rec.split('\t');
      if (fields.length >= 3 && fields[0] === '-' && fields[1] === '-') {
        set.add(fields[2]);
      }
    }
    return set;
  } catch {
    return new Set();
  }
}

export async function showFile(repoRoot: string, rev: string, posixPath: string): Promise<string> {
  const { stdout } = await execGit(repoRoot, ['show', buildShowSpec(rev, posixPath)]);
  return stdout.toString('utf8');
}
