import * as vscode from 'vscode';
import { showFile } from './gitService';
import { decodeDiffQuery, EMPTY_REV } from './gitParse';

export const DIFF_SCHEME = 'gitdiff';

/** gitdiff:/<posixPath>?repo=...&rev=...&side=... を供給 */
export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private cache = new Map<string, string>();
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  clearCache(): void {
    this.cache.clear();
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const posixPath = uri.path.replace(/^\//, '');
    const { repo, rev } = decodeDiffQuery(uri.query);
    if (rev === EMPTY_REV) {
      return '';
    }
    if (!repo || !rev) {
      return '';
    }
    const key = `${repo}\0${rev}\0${posixPath}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) {
      return hit;
    }
    try {
      const text = await showFile(repo, rev, posixPath);
      if (text.includes('\0')) {
        return '※ バイナリファイルのため内容を表示できません。';
      }
      this.cache.set(key, text);
      return text;
    } catch (e) {
      return `※ 内容を取得できませんでした: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
}
