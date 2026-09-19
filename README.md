# Git Range Diff Viewer

Gitの任意の2コミット間の差分を視覚的に確認するための拡張機能です。専用サイドバーのファイル一覧と、VSCode標準の左右diffエディタで差分を表示します。

## 機能

- **コミット履歴ビュー**: 専用の `Commit Diff` アクティビティに履歴を表示します (100件ごとにページ送り)。ビューを開くと自動で読み込まれます。
- **範囲指定は2通り**:
  - コミットを右クリック (またはホバー時の ○/● をクリック) → `Set as Old Commit` で古い方、別のコミットで `Set as New Commit & Compare` を実行。
  - または `Select Commits to Compare` を実行し、QuickPickで古い方→新しい方の順に選択 (新しい方は省略可。省略時は `HEAD`)。
- **変更ファイル一覧**: 状態別に色分け表示 (追加・変更・削除・リネーム。リネームは `旧パス → 新パス` 形式)。
- **標準diffエディタ**: ファイルをクリック (または右クリック → `Open Diff`) で `vscode.diff` に差分を表示。バイナリファイルは通知のみ表示します。
- LinuxとWindowsに対応 (インストール済みの `git` を使用し、VSCodeの `git.path` 設定を尊重します)。

## コマンド

| コマンド | 説明 |
|---|---|
| `Select Commits to Compare` | QuickPickで古い方→新しい方の順に選択 |
| `Set as Old Commit` | クリックしたコミットを古い方に設定 (コミットのコンテキストメニュー) |
| `Set as New Commit & Compare` | クリックしたコミットを新しい方に設定し、すぐに比較 |
| `Clear Commit Selection` | 古い方・新しい方の選択を解除 |
| `Refresh Commit History` | コミット履歴を再読み込み |
| `Select Repository` | 対象リポジトリを切り替え (マルチルート用) |
| `Refresh Diff` | 現在の範囲でファイル一覧を再取得 |
| `Clear View` | ファイル一覧を空にする |
| `Open Diff` | クリックしたファイルの差分を開く |
| `Load More Commits` | コミット履歴の次ページを読み込み |

## 拡張機能の設定

- `gitRangeDiff.gitPath`: git実行ファイルのパス。空の場合はVSCodeの `git.path` 設定、なければPATH上の `git` を使います。
- `gitRangeDiff.logPageSize`: 選択UI・履歴表示の1ページあたりの取得件数 (既定 `100`)。
- `gitRangeDiff.maxFiles`: ファイル一覧に表示する上限件数 (既定 `1000`)。

## 要件

- Gitがインストール済みであること (`git.path` / `gitRangeDiff.gitPath` での指定も可)。
- Gitリポジトリ内のフォルダを開いてから使用してください。

## ライセンス

[MIT](LICENSE)
