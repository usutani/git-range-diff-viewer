import * as vscode from 'vscode';
import { getCommits } from './gitService';
import { CommitInfo } from './gitParse';

export interface CommitRange {
  oldRev: string;
  oldSubject: string;
  newRev: string; // 'HEAD' の場合あり
  newSubject: string;
}

const NEXT = '__next_page__';
const PREV = '__prev_page__';
const HEAD_ITEM = '__head__';

function toItem(c: CommitInfo): vscode.QuickPickItem & { hash: string } {
  return {
    label: `$(${c.ref ? 'git-branch' : 'git-commit'}) ${c.subject || '(no message)'}`,
    description: `${c.hash.slice(0, 8)} ${c.author} ${c.date}${c.ref ? ` ${c.ref}` : ''}`,
    detail: c.hash,
    hash: c.hash,
  };
}

async function pickOne(
  repoRoot: string,
  placeHolder: string,
  allowHead: boolean,
  pageSize: number
): Promise<{ kind: 'commit'; info: CommitInfo } | { kind: 'head' } | undefined> {
  let skip = 0;
  for (;;) {
    const commits = await getCommits(repoRoot, skip, pageSize);
    const items: (vscode.QuickPickItem & { id: string; hash?: string; info?: CommitInfo })[] = [];
    if (allowHead) {
      items.push({
        id: HEAD_ITEM,
        label: '$(target) HEAD (省略時と同じ・最新)',
        description: '新しい方のコミットを省略する',
      });
    }
    if (skip > 0) {
      items.push({ id: PREV, label: '$(arrow-up) 前の100件に戻る' });
    }
    for (const c of commits) {
      const it = toItem(c);
      items.push({ ...it, id: c.hash, hash: c.hash, info: c });
    }
    if (commits.length === pageSize) {
      items.push({ id: NEXT, label: '$(arrow-down) 次の100件を表示…' });
    }
    if (commits.length === 0 && skip > 0) {
      vscode.window.showInformationMessage('これ以上古いコミットはありません。');
      skip = Math.max(0, skip - pageSize);
      continue;
    }
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: `${placeHolder} (取得 ${skip + 1}〜${skip + commits.length}件目)`,
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked) {
      return undefined;
    }
    if (picked.id === NEXT) {
      skip += pageSize;
      continue;
    }
    if (picked.id === PREV) {
      skip = Math.max(0, skip - pageSize);
      continue;
    }
    if (picked.id === HEAD_ITEM) {
      return { kind: 'head' };
    }
    return { kind: 'commit', info: picked.info as CommitInfo };
  }
}

/** 古い方→新しい方の順に選択。新しい方省略時はHEAD */
export async function pickCommitRange(repoRoot: string): Promise<CommitRange | undefined> {
  const pageSize = vscode.workspace.getConfiguration('gitRangeDiff').get<number>('logPageSize', 100);
  const oldPicked = await pickOne(repoRoot, '古い方のコミットを選択', false, pageSize);
  if (!oldPicked || oldPicked.kind !== 'commit') {
    return undefined;
  }
  const newPicked = await pickOne(repoRoot, '新しい方のコミットを選択 (省略=HEAD)', true, pageSize);
  if (!newPicked) {
    return undefined; // キャンセルはHEAD扱いにせず中断
  }
  if (newPicked.kind === 'head') {
    return { oldRev: oldPicked.info.hash, oldSubject: oldPicked.info.subject, newRev: 'HEAD', newSubject: 'HEAD' };
  }
  return {
    oldRev: oldPicked.info.hash,
    oldSubject: oldPicked.info.subject,
    newRev: newPicked.info.hash,
    newSubject: newPicked.info.subject,
  };
}
