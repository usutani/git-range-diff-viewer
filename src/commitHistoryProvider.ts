import * as vscode from 'vscode';
import { getCommits } from './gitService';
import { CommitInfo } from './gitParse';
import { log } from './logger';

export type CommitNodeKind = 'info' | 'head' | 'commit' | 'loadMore';

export class CommitNode extends vscode.TreeItem {
  constructor(
    public readonly kind: CommitNodeKind,
    public readonly hash: string,
    public readonly subject: string,
    public readonly author = '',
    public readonly date = ''
  ) {
    super(subject || '(no message)', vscode.TreeItemCollapsibleState.None);
  }
}

/** コミット履歴を表示し、old/new選択マーカーを付ける */
export class CommitHistoryProvider implements vscode.TreeDataProvider<CommitNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CommitNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  repoRoot = '';
  private commits: CommitInfo[] = [];
  private hasMore = false;
  private busy = false;
  private oldHash?: string;
  private newHash?: string;

  private get pageSize(): number {
    return vscode.workspace.getConfiguration('gitRangeDiff').get<number>('logPageSize', 100);
  }

  /** リポジトリが変わったら履歴と選択をリセットして先頭ページを取得 */
  async reload(repoRoot: string): Promise<void> {
    if (this.repoRoot !== repoRoot) {
      this.oldHash = undefined;
      this.newHash = undefined;
    }
    this.repoRoot = repoRoot;
    this.commits = [];
    this.hasMore = true;
    await this.loadMoreInternal();
    this._onDidChangeTreeData.fire();
  }

  async loadMore(): Promise<void> {
    await this.loadMoreInternal();
    this._onDidChangeTreeData.fire();
  }

  private async loadMoreInternal(): Promise<void> {
    if (!this.repoRoot || this.busy || !this.hasMore) {
      return;
    }
    this.busy = true;
    try {
      const page = await getCommits(this.repoRoot, this.commits.length, this.pageSize);
      this.commits.push(...page);
      this.hasMore = page.length === this.pageSize;
    } finally {
      this.busy = false;
    }
  }

  setSelection(oldHash?: string, newHash?: string): void {
    this.oldHash = oldHash;
    this.newHash = newHash;
    log(`setSelection: old=${oldHash ?? '(none)'} new=${newHash ?? '(none)'}`);
    this._onDidChangeTreeData.fire();
  }

  /** リポジトリ未確定の初期状態に戻す */
  reset(): void {
    this.repoRoot = '';
    this.commits = [];
    this.hasMore = false;
    this.oldHash = undefined;
    this.newHash = undefined;
    this._onDidChangeTreeData.fire();
  }

  clearSelection(): void {
    this.setSelection(undefined, undefined);
  }

  getTreeItem(el: CommitNode): vscode.TreeItem {
    return el;
  }

  async getChildren(): Promise<CommitNode[]> {
    if (!this.repoRoot) {
      const info = new CommitNode('info', '', 'リポジトリを選択してください (クリック)');
      info.iconPath = new vscode.ThemeIcon('folder-opened');
      info.contextValue = 'repoPlaceholder';
      info.command = { command: 'gitRangeDiff.selectRepository', title: 'Select Repository' };
      return [info];
    }
    log(`getChildren: commits=${this.commits.length} old=${this.oldHash ?? '(none)'} new=${this.newHash ?? '(none)'}`);
    const nodes: CommitNode[] = [];
    nodes.push(this.makeNode('head', 'HEAD', 'HEAD (最新)'));
    for (const c of this.commits) {
      nodes.push(this.makeNode('commit', c.hash, c.subject, c.author, c.date));
    }
    if (this.hasMore) {
      const more = new CommitNode('loadMore', '', '$(arrow-down) 次の100件を表示…');
      more.contextValue = 'loadMoreItem';
      more.command = { command: 'gitRangeDiff.loadMoreCommits', title: 'Load More Commits' };
      nodes.push(more);
    }
    return nodes;
  }

  private makeNode(kind: 'head' | 'commit', hash: string, subject: string, author = '', date = ''): CommitNode {
    const node = new CommitNode(kind, hash, subject, author, date);
    const marks: string[] = [];
    const tags: string[] = [];
    if (this.oldHash === hash) {
      marks.push('← old');
      tags.push('old');
    }
    if (this.newHash === hash) {
      marks.push('← new');
      tags.push('new');
    }
    if (tags.length > 0) {
      const tagText = `[${tags.join(',')}] `;
      // タグ部にハイライト背景を付与 ([0, end)はend-exclusive)
      node.label = { label: `${tagText}${subject || '(no message)'}`, highlights: [[0, tagText.length - 1]] };
    }
    const base = kind === 'head' ? 'HEAD' : `${hash.slice(0, 8)} ${author} ${date}`;
    node.description = marks.length ? `${base} ${marks.join(' ')}` : base;
    node.tooltip = kind === 'head' ? 'HEAD (最新の状態)' : `${subject}\n${hash}\n${author} ${date}`;
    node.contextValue = 'commitItem';
    if (this.oldHash === hash && this.newHash === hash) {
      node.iconPath = new vscode.ThemeIcon('record', new vscode.ThemeColor('charts.yellow'));
    } else if (this.oldHash === hash) {
      node.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue'));
    } else if (this.newHash === hash) {
      node.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.green'));
    } else {
      node.iconPath = new vscode.ThemeIcon(kind === 'head' ? 'target' : 'git-commit');
    }
    return node;
  }
}
