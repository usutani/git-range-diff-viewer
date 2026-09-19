# Git Range Diff Viewer

Visually compare any two Git commits: a file list in a dedicated sidebar view and details in VSCode's standard side-by-side diff editor.

## Features

- **Commit History view**: shows recent commits (100 per page with paging) in a dedicated `Commit Diff` activity. The history loads automatically when the view opens.
- **Pick a range two ways**:
  - Right-click (or hover and click ○/●) a commit → `Set as Old Commit`, then another commit → `Set as New Commit & Compare`.
  - Or run `Select Commits to Compare` and pick both commits from QuickPick (newer side can be omitted to use `HEAD`).
- **Changed file list**: color-coded by status (added / modified / deleted / renamed, renames shown as `old → new`).
- **Standard diff editor**: click a file (or right-click → `Open Diff`) to open it in `vscode.diff`. Binary files show an information message instead.
- Works on Linux and Windows (uses your installed `git`, honoring VSCode's `git.path` setting).

## Commands

| Command | Description |
|---|---|
| `Select Commits to Compare` | Pick older then newer commit via QuickPick |
| `Set as Old Commit` | Set the clicked commit as the older side (commit context menu) |
| `Set as New Commit & Compare` | Set the clicked commit as the newer side and compare immediately |
| `Clear Commit Selection` | Clear the old/new selection |
| `Refresh Commit History` | Reload the commit history |
| `Select Repository` | Switch the target repository (multi-root workspaces) |
| `Refresh Diff` | Re-fetch the file list for the current range |
| `Clear View` | Clear the file list |
| `Open Diff` | Open the diff for the clicked file |
| `Load More Commits` | Load the next page of commit history |

## Extension Settings

- `gitRangeDiff.gitPath`: Path to the git executable. Empty means VSCode's `git.path` setting, falling back to `git` on PATH.
- `gitRangeDiff.logPageSize`: Commits fetched per page in pickers/history (default `100`).
- `gitRangeDiff.maxFiles`: Maximum files shown in the file list (default `1000`).

## Requirements

- Git must be installed and available (or configured via `git.path` / `gitRangeDiff.gitPath`).
- Open a folder inside a Git repository before use.

## License

[MIT](LICENSE)
