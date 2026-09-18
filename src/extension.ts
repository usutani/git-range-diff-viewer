import * as vscode from 'vscode';
import { pickCommitRange, CommitRange } from './commitPicker';
import { getBinarySet, getChangedFiles, resolveRepoAuto, resolveRepoRoot, toRepoRoot } from './gitService';
import { DiffTreeProvider, FileNode } from './diffTreeProvider';
import { CommitHistoryProvider, CommitNode } from './commitHistoryProvider';
import { DIFF_SCHEME, DiffContentProvider } from './diffContentProvider';
import { EMPTY_REV, encodeDiffQuery, FileEntry } from './gitParse';
import { initLog, log } from './logger';

let current: { range: CommitRange; repoRoot: string } | undefined;
/** ツリーからのold/new選択 (確定前の保留状態) */
let pendingOld: { hash: string; subject: string } | undefined;
let pendingNew: { hash: string; subject: string } | undefined;

function diffUri(repoRoot: string, rev: string, posixPath: string, side: 'left' | 'right'): vscode.Uri {
  return vscode.Uri.from({
    scheme: DIFF_SCHEME,
    path: `/${posixPath}`,
    query: encodeDiffQuery(repoRoot, rev, side),
  });
}

const short = (h: string) => (h === 'HEAD' ? 'HEAD' : h.slice(0, 8));

export function activate(context: vscode.ExtensionContext): void {
  initLog(context);
  log('activated');
  const tree = new DiffTreeProvider();
  const history = new CommitHistoryProvider();
  const content = new DiffContentProvider();

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, content),
    vscode.window.createTreeView('gitRangeDiffCommits', { treeDataProvider: history, showCollapseAll: false }),
    vscode.window.createTreeView('gitRangeDiffView', { treeDataProvider: tree, showCollapseAll: false }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      try {
        const auto = await resolveRepoAuto();
        if (auto) {
          pendingOld = undefined;
          pendingNew = undefined;
          await history.reload(auto);
        } else {
          history.reset();
        }
      } catch {
        history.reset();
      }
    })
  );

  // 起動時に履歴を自動読み込み (失敗時はプレースホルダのまま)
  void (async () => {
    try {
      const auto = await resolveRepoAuto();
      if (auto) {
        await history.reload(auto);
      }
    } catch {
      // ignore: プレースホルダ表示のままにする
    }
  })();

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
        pendingOld = { hash: range.oldRev, subject: range.oldSubject };
        pendingNew = { hash: range.newRev, subject: range.newSubject };
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: '差分を取得しています…' },
          async () => {
            await history.reload(repoRoot);
            history.setSelection(range.oldRev, range.newRev);
            await loadRange(repoRoot, range);
          }
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
      pendingOld = undefined;
      pendingNew = undefined;
      content.clearCache();
      tree.clear();
      history.clearSelection();
    }),

    vscode.commands.registerCommand('gitRangeDiff.setOldCommit', async (node: CommitNode) => {
      log(`setOldCommit invoked: kind=${node?.kind} hash=${node?.hash} subject=${node?.subject}`);
      if (!node || (node.kind !== 'commit' && node.kind !== 'head')) {
        log('setOldCommit: ignored (unexpected node)');
        return;
      }
      if (!history.repoRoot) {
        vscode.window.showWarningMessage('先に「Select Commits to Compare」を実行してください。');
        return;
      }
      pendingOld = { hash: node.hash, subject: node.subject };
      history.setSelection(pendingOld.hash, pendingNew?.hash);
      vscode.window.showInformationMessage(`古い方に設定: ${short(node.hash)} ${node.subject}`);
    }),

    vscode.commands.registerCommand('gitRangeDiff.setNewAndCompare', async (node: CommitNode) => {
      log(`setNewAndCompare invoked: kind=${node?.kind} hash=${node?.hash} subject=${node?.subject}`);
      if (!node || (node.kind !== 'commit' && node.kind !== 'head')) {
        log('setNewAndCompare: ignored (unexpected node)');
        return;
      }
      if (!history.repoRoot) {
        vscode.window.showWarningMessage('先に「Select Commits to Compare」を実行してください。');
        return;
      }
      if (!pendingOld) {
        vscode.window.showWarningMessage('先にコンテキストメニューから古い方のコミットを設定してください。');
        return;
      }
      pendingNew = { hash: node.hash, subject: node.subject };
      history.setSelection(pendingOld.hash, pendingNew.hash);
      const range: CommitRange = {
        oldRev: pendingOld.hash,
        oldSubject: pendingOld.subject,
        newRev: pendingNew.hash,
        newSubject: pendingNew.subject,
      };
      if (range.oldRev === range.newRev) {
        vscode.window.showInformationMessage('同一コミットが選択されたため差分はありません。');
      }
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: '差分を取得しています…' },
          () => loadRange(history.repoRoot, range)
        );
      } catch (e) {
        vscode.window.showErrorMessage(`差分の取得に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),

    vscode.commands.registerCommand('gitRangeDiff.clearCommitSelection', () => {
      pendingOld = undefined;
      pendingNew = undefined;
      history.clearSelection();
    }),

    vscode.commands.registerCommand('gitRangeDiff.refreshCommits', async () => {
      if (!history.repoRoot) {
        vscode.window.showInformationMessage('先に「Select Commits to Compare」を実行してください。');
        return;
      }
      try {
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'コミット履歴を更新しています…' },
          () => history.reload(history.repoRoot)
        );
        history.setSelection(pendingOld?.hash, pendingNew?.hash);
      } catch (e) {
        vscode.window.showErrorMessage(`更新に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),

    vscode.commands.registerCommand('gitRangeDiff.loadMoreCommits', async () => {
      try {
        await history.loadMore();
      } catch (e) {
        vscode.window.showErrorMessage(`履歴の取得に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),

    vscode.commands.registerCommand('gitRangeDiff.selectRepository', async () => {
      try {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
          vscode.window.showErrorMessage('比較対象のワークスペースフォルダを開いてから実行してください。');
          return;
        }
        let fsPath = folders[0].uri.fsPath;
        if (folders.length > 1) {
          const picked = await vscode.window.showQuickPick(
            folders.map((f) => ({ label: f.uri.fsPath, description: f.name })),
            { placeHolder: '比較対象のリポジトリ(ワークスペースフォルダ)を選択' }
          );
          if (!picked) {
            return;
          }
          fsPath = picked.label;
        }
        const repoRoot = await toRepoRoot(fsPath);
        pendingOld = undefined;
        pendingNew = undefined;
        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'コミット履歴を取得しています…' },
          () => history.reload(repoRoot)
        );
      } catch {
        vscode.window.showErrorMessage('Gitリポジトリ内のフォルダを選択してください。');
      }
    }),

    vscode.commands.registerCommand('gitRangeDiff.openDiff', async (arg: FileEntry | FileNode) => {
      // 左クリック経路ではFileEntry、右クリックメニュー経路ではFileNodeが渡る
      const entry = (arg as FileNode)?.entry ?? (arg as FileEntry);
      if (!entry?.path) {
        log(`openDiff: unexpected argument ${JSON.stringify(arg)?.slice(0, 200)}`);
        vscode.window.showWarningMessage('ファイル情報を取得できませんでした。一覧から開き直してください。');
        return;
      }
      if (!current) {
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
