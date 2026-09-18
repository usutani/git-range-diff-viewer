/** VSCode APIに依存しない純粋関数群。Windows対応のためパスはposix基準。 */

export type ChangeStatus = 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | 'X';

export interface FileEntry {
  /** 表示用パス(リネーム後は新パス)。git相対・posix区切り */
  path: string;
  /** リネーム・コピー元パス (R/Cのみ) */
  oldPath?: string;
  status: ChangeStatus;
  /** 'R100' のような生ステータス */
  rawStatus: string;
}

/** `git diff --name-status -z` 出力をパースする。
 * -z 指定時は NUL がフィールド区切りになる (例: `M\0path\0`, `R100\0old\0new\0`)。
 * 非 -z 出力 (`M\tpath` のレコード区切り) も許容する。 */
export function parseNameStatusZ(stdout: string | Buffer): FileEntry[] {
  const text = typeof stdout === 'string' ? stdout : stdout.toString('utf8');
  const tokens = text.split('\0');
  const entries: FileEntry[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i++];
    if (!tok) {
      continue;
    }
    if (tok.includes('\t') || tok.includes('\n')) {
      // 非 -z 形式のフォールバック: 行区切り `STATUS\tPATH` / `R100\tOLD\tNEW`
      for (const line of tok.split('\n')) {
        if (!line) {
          continue;
        }
        const fields = line.split('\t');
        const raw = fields[0] ?? '';
        const kind = raw[0] as ChangeStatus;
        if ((kind === 'R' || kind === 'C') && fields.length >= 3) {
          entries.push({ status: kind, rawStatus: raw, oldPath: fields[1], path: fields[2] });
        } else if (fields.length >= 2) {
          entries.push({ status: kind, rawStatus: raw, path: fields[1] });
        }
      }
      continue;
    }
    const kind = tok[0] as ChangeStatus;
    if (kind === 'R' || kind === 'C') {
      const oldPath = tokens[i++] ?? '';
      const newPath = tokens[i++] ?? '';
      if (!newPath) {
        continue;
      }
      entries.push({ status: kind, rawStatus: tok, oldPath, path: newPath });
    } else {
      const path = tokens[i++] ?? '';
      if (!path) {
        continue;
      }
      entries.push({ status: kind, rawStatus: tok, path });
    }
  }
  return entries;
}

/** `git log --pretty=format:%H%x00%s%x00%an%x00%ad%x00%D` 1行分 */
export interface CommitInfo {
  hash: string;
  subject: string;
  author: string;
  date: string;
  ref?: string;
}

export function parseLogLines(stdout: string | Buffer): CommitInfo[] {
  const text = typeof stdout === 'string' ? stdout : stdout.toString('utf8');
  const out: CommitInfo[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    const [hash = '', subject = '', author = '', date = '', ref = ''] = line.split('\0');
    if (!hash) {
      continue;
    }
    out.push({ hash, subject, author, date, ref });
  }
  return out;
}

/** Windowsの `\` 区切りをgit用 `/` に変換 */
export function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** `git show <rev>:<path>` の引数を作る */
export function buildShowSpec(rev: string, posixPath: string): string {
  return `${rev}:${toPosixPath(posixPath).replace(/^\//, '')}`;
}

/** 仮想ドキュメント用クエリ (vscodeなしでURLSearchParamsのみ使用) */
export function encodeDiffQuery(repo: string, rev: string, side: 'left' | 'right'): string {
  const q = new URLSearchParams({ repo, rev, side });
  return q.toString();
}

export function decodeDiffQuery(query: string): { repo: string; rev: string; side: string } {
  const q = new URLSearchParams(query);
  return { repo: q.get('repo') ?? '', rev: q.get('rev') ?? '', side: q.get('side') ?? '' };
}

/** 空ドキュメント判定用 rev */
export const EMPTY_REV = '__EMPTY__';
