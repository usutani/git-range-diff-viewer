import * as vscode from 'vscode';
import { CommitRange } from './commitPicker';
import { FileEntry } from './gitParse';

export class DiffTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private range?: CommitRange;
  private entries: FileEntry[] = [];
  private repoRoot = '';
  private truncated = false;

  setData(range: CommitRange, repoRoot: string, entries: FileEntry[], truncated: boolean): void {
    this.range = range;
    this.repoRoot = repoRoot;
    this.entries = entries;
    this.truncated = truncated;
    this._onDidChangeTreeData.fire();
  }

  clear(): void {
    this.range = undefined;
    this.entries = [];
    this.repoRoot = '';
    this.truncated = false;
    this._onDidChangeTreeData.fire();
  }

  get count(): number {
    return this.entries.length;
  }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem {
    return el;
  }

  async getChildren(el?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (el) {
      return [];
    }
    if (!this.range) {
      const item = new vscode.TreeItem('「コミット範囲を選択して比較」を実行してください', vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon('info');
      return [item];
    }
    const short = (h: string) => (h === 'HEAD' ? 'HEAD' : h.slice(0, 8));
    const header = new vscode.TreeItem(
      `${short(this.range.oldRev)}..${short(this.range.newRev)} (${this.entries.length}件${this.truncated ? '・上限で省略あり' : ''})`,
      vscode.TreeItemCollapsibleState.None
    );
    header.iconPath = new vscode.ThemeIcon('git-compare');
    header.tooltip = `${this.range.oldSubject}\n→ ${this.range.newSubject}\n${this.repoRoot}`;
    header.contextValue = 'diffHeader';

    const files = this.entries.map((e) => {
      const item = new vscode.TreeItem(e.oldPath ? `${e.oldPath} → ${e.path}` : e.path, vscode.TreeItemCollapsibleState.None);
      item.description = e.rawStatus;
      item.tooltip = `${e.rawStatus} ${e.oldPath ? `${e.oldPath} → ${e.path}` : e.path}`;
      item.contextValue = 'diffFile';
      item.iconPath = DiffTreeProvider.iconFor(e.status);
      item.command = {
        command: 'gitRangeDiff.openDiff',
        title: '差分を開く',
        arguments: [e],
      };
      return item;
    });
    return [header, ...files];
  }

  private static iconFor(status: string): vscode.ThemeIcon {
    switch (status) {
      case 'A':
        return new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
      case 'D':
        return new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
      case 'R':
      case 'C':
        return new vscode.ThemeIcon('diff-renamed', new vscode.ThemeColor('gitDecoration.stageModifiedResourceForeground'));
      default:
        return new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
    }
  }
}
