import * as vscode from 'vscode';
import { CommitRange } from './commitPicker';
import { FileEntry } from './gitParse';

/** FileEntryを保持するツリー要素。左クリック(command引数)と右クリック(要素自体)の両経路に対応 */
export class FileNode extends vscode.TreeItem {
  constructor(public readonly entry: FileEntry | undefined, label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
  }
}

export class DiffTreeProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileNode | undefined | void>();
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

  getTreeItem(el: FileNode): vscode.TreeItem {
    return el;
  }

  async getChildren(el?: FileNode): Promise<FileNode[]> {
    if (el) {
      return [];
    }
    if (!this.range) {
      const item = new FileNode(
        undefined,
        '「Select Commits to Compare」を実行してください'
      );
      item.iconPath = new vscode.ThemeIcon('info');
      return [item];
    }
    const short = (h: string) => (h === 'HEAD' ? 'HEAD' : h.slice(0, 8));
    const header = new FileNode(
      undefined,
      `${short(this.range.oldRev)}..${short(this.range.newRev)} (${this.entries.length}件${this.truncated ? '・上限で省略あり' : ''})`
    );
    header.iconPath = new vscode.ThemeIcon('git-compare');
    header.tooltip = `${this.range.oldSubject}\n→ ${this.range.newSubject}\n${this.repoRoot}`;
    header.contextValue = 'diffHeader';

    const files = this.entries.map((e) => {
      const item = new FileNode(e, e.oldPath ? `${e.oldPath} → ${e.path}` : e.path);
      item.description = e.rawStatus;
      item.tooltip = `${e.rawStatus} ${e.oldPath ? `${e.oldPath} → ${e.path}` : e.path}`;
      item.contextValue = 'diffFile';
      item.iconPath = DiffTreeProvider.iconFor(e.status);
      item.command = {
        command: 'gitRangeDiff.openDiff',
        title: 'Open Diff',
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
