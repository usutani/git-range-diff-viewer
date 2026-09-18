import * as vscode from 'vscode';
import { pickCommitRange, CommitRange } from './commitPicker';
import { getBinarySet, getChangedFiles, resolveRepoRoot } from './gitService';
import { DiffTreeProvider } from './diffTreeProvider';
import { DIFF_SCHEME, DiffContentProvider } from './diffContentProvider';
import { EMPTY_REV, encodeDiffQuery, FileEntry } from './gitParse';

let current: { range: CommitRange; repoRoot: string } | undefined;

function diffUri(repoRoot: string, rev: string, posixPath: string, side: 'left' | 'right'): vscode.Uri {
  return vscode.Uri.from({
    scheme: DIFF_SCHEME,
    path: `/${posixPath}`,
    query: encodeDiffQuery(repoRoot, rev, side),
  });
}

const short = (h: string) => (h === 'HEAD' ? 'HEAD' : h.slice(0, 8));

export function activate(context: vscode.ExtensionContext): void {
  const tree = new DiffTreeProvider();
  const content = new DiffContentProvider();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, content),
    vscode.window.createTreeView('gitRangeDiffView', { treeDataProvider: tree, showCollapseAll: false })
  );

  async function loadRange(repoRoot: string, range: CommitRange): Promise<void> {
    const maxFiles = vscode.workspace.getConfiguration('gitRangeDiff').get<number>('maxFiles', 1000);
    const { entries, truncated } = await getChangedFiles(repoRoot, range.oldRev, range.newRev, maxFiles);
    current = { range, repoRoot };
    content.clearCache();
    tree.setData(range, repoRoot, entries, truncated);
    if (entries.length === 0) {
      vscode.window.showInformationMessage(`差分はありません (${short(range.oldRev)}..${short(range.newRev)})`);
    } else if (truncated) {
      vscode.window.showWarningMessage(`ファイル数が上限(${maxFiles}件)を超えたため一部のみ表示しています。`);
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('gitRangeDiff.selectCommits', async () => {
      try {
        const repoRoot = await resolveRepoRoot();
        if (!repoRoot) {
          vscode.window.showErrorMessage('Gitリポジトリ内のワークスペースフォルダを開いてから実行してください。');
          return;
        }
        const range = await pickCommitRange(repoRoot);
        if (!range) {
          return;
        }
        if (range.oldRev === range.newRev) {
          vscode.window.showInformationMessage('同一コミットが選択されたため差分はありません。');
        }
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: '差分を取得しています…' },
          () => loadRange(repoRoot, range)
        );
      } catch (e) {
        vscode.window.showErrorMessage(`差分の取得に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),

    vscode.commands.registerCommand('gitRangeDiff.refresh', async () => {
      if (!current) {
        vscode.window.showInformationMessage('先に「コミット範囲を選択して比較」を実行してください。');
        return;
      }
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: '差分を更新しています…' },
          () => loadRange(current!.repoRoot, current!.range)
        );
      } catch (e) {
        vscode.window.showErrorMessage(`更新に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),

    vscode.commands.registerCommand('gitRangeDiff.clear', () => {
      current = undefined;
      content.clearCache();
      tree.clear();
    }),

    vscode.commands.registerCommand('gitRangeDiff.openDiff', async (entry: FileEntry) => {
      if (!current || !entry) {
        return;
      }
      const { range, repoRoot } = current;
      try {
        const binaries = await getBinarySet(repoRoot, range.oldRev, range.newRev);
        if (binaries.has(entry.path) || (entry.oldPath && binaries.has(entry.oldPath))) {
          vscode.window.showInformationMessage(`バイナリファイルのため差分を表示しません: ${entry.path}`);
          return;
        }
      } catch {
        // numstat失敗時はそのまま開く
      }
      // 追加=左を空、削除=右を空、リネーム=旧パスと新パス
      const leftPath = entry.oldPath ?? entry.path;
      const leftRev = entry.status === 'A' ? EMPTY_REV : range.oldRev;
      const rightRev = entry.status === 'D' ? EMPTY_REV : range.newRev;
      const title = `${entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path} (${entry.rawStatus} ${short(range.oldRev)}..${short(range.newRev)})`;
      await vscode.commands.executeCommand(
        'vscode.diff',
        diffUri(repoRoot, leftRev, leftPath, 'left'),
        diffUri(repoRoot, rightRev, entry.path, 'right'),
        title,
        { preview: true }
      );
    })
  );
}

export function deactivate(): void {}
