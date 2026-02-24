# Plan: Use `git ls-files` for File Indexing

## Motivation

The current `fullRefresh()` uses `vscode.workspace.findFiles`, which:
- Only works when a VS Code workspace is open
- Requires manually configuring `fileMention.excludePatterns` to mirror `.gitignore`
- Does a filesystem crawl on every refresh

`git ls-files` reads git's binary index directly — no filesystem traversal, automatically
respects `.gitignore`, and works from any directory that has a git repo ancestor.

## Benefits

| | `git ls-files` | `workspace.findFiles` |
|---|---|---|
| Needs workspace open | No | Yes |
| Respects .gitignore | Automatic | Manual config |
| Speed | Faster (reads index) | Slower (fs crawl) |
| Works for standalone files | Yes (walks up to git root) | No |

## Approach

Replace `fullRefresh()` with a tiered strategy:

1. **Git repo detected** → run `git ls-files` via `child_process.execFile`
2. **Workspace open, no git** → fall back to `workspace.findFiles` (existing behaviour)
3. **No workspace, no git** → fall back to `fs.readdir` walk from the open file's directory

Git root detection: walk up from the active editor's file path looking for a `.git` directory.

## Implementation

### Finding the git root

```javascript
const fs = require('fs');
const path = require('path');

function findGitRoot(startPath) {
  let dir = startPath;
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}
```

### Running git ls-files

```javascript
const cp = require('child_process');

function indexViaGit(gitRoot) {
  return new Promise((resolve, reject) => {
    cp.execFile(
      'git', ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err);
        const uris = stdout
          .split('\n')
          .filter(Boolean)
          .map(rel => vscode.Uri.file(path.join(gitRoot, rel)));
        resolve(uris);
      }
    );
  });
}
```

`--cached` = tracked files, `--others --exclude-standard` = untracked files not in .gitignore.

### Updated fullRefresh()

```javascript
async function fullRefresh() {
  if (isRefreshing) { pendingRefresh = true; return; }
  isRefreshing = true;
  try {
    // Determine a starting path for git root detection
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const startPath = activeFile ? path.dirname(activeFile) : workspaceRoot;

    if (startPath) {
      const gitRoot = findGitRoot(startPath);
      if (gitRoot) {
        const uris = await indexViaGit(gitRoot);
        fileEntries = uris.map(makeFileEntry);
        folderEntries = deriveFolderEntries(fileEntries);
        return;
      }
    }

    // Fallback: workspace.findFiles
    if (workspaceRoot) {
      const uris = await vscode.workspace.findFiles('**/*', buildExcludeGlob(), maxResults);
      fileEntries = uris.map(makeFileEntry);
      folderEntries = deriveFolderEntries(fileEntries);
      return;
    }

    // Last resort: allowlistFolders (existing behaviour)
    // ...
  } finally {
    isRefreshing = false;
    if (pendingRefresh) { pendingRefresh = false; fullRefresh(); }
  }
}
```

### Watcher change

The `FileSystemWatcher('**/*')` only works within a VS Code workspace. For git-root-based
indexing, replace it with watching the git index file directly:

```javascript
const gitIndexWatcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(gitRoot, '.git/index')
);
gitIndexWatcher.onDidChange(() => scheduleRefresh());
```

Changes to `.git/index` (i.e. staging/unstaging files) will trigger a re-index. For new
untracked files, also keep a watcher on the working tree.

## Configuration impact

- `fileMention.excludePatterns` becomes a no-op when git is available (gitignore handles it)
- Could add `fileMention.includeUntracked` (boolean, default `true`) to control whether
  `--others --exclude-standard` is passed to `git ls-files`

## Out of scope

- Files outside the git repo (e.g. `~/some-other-folder`) — would require shell-style
  absolute path completion, a separate feature
- Monorepos with multiple git roots — only the nearest ancestor git root is used
