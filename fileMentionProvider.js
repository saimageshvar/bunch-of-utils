const vscode = require('vscode');

// Pre-computed cache entries — paid once at index time, not per keystroke
// fileEntries: { uri, relativePath, lowerPath, basename }
// folderEntries: { relativePath, lowerPath, basename }
let fileEntries = [];
let folderEntries = [];

let isRefreshing = false;
let pendingRefresh = false; // concurrency guard: queue at most one pending refresh

function getConfig() {
  return vscode.workspace.getConfiguration('fileMention');
}

function buildExcludeGlob() {
  const patterns = getConfig().get('excludePatterns', '**/node_modules/**,**/.git/**,**/dist/**,**/build/**');
  const parts = patterns.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `{${parts.join(',')}}`;
}

// Pre-compute all string ops at cache-build time, not at query time
function makeFileEntry(uri) {
  const relativePath = vscode.workspace.asRelativePath(uri);
  const lowerPath = relativePath.toLowerCase();
  const segments = relativePath.split('/');
  const basename = segments[segments.length - 1].toLowerCase();
  return { uri, relativePath, lowerPath, basename };
}

function deriveFolderEntries(entries) {
  const seen = new Set();
  const folders = [];
  for (const { relativePath } of entries) {
    const parts = relativePath.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!seen.has(dir)) {
        seen.add(dir);
        const lowerPath = dir.toLowerCase();
        const segs = dir.split('/');
        const basename = segs[segs.length - 1].toLowerCase();
        folders.push({ relativePath: dir, lowerPath, basename });
      }
    }
  }
  return folders;
}

async function fullRefresh() {
  // Concurrency guard: if already running, mark a pending refresh instead of stacking
  if (isRefreshing) {
    pendingRefresh = true;
    return;
  }
  isRefreshing = true;
  try {
    const config = getConfig();
    const maxResults = config.get('maxResults', 5000);
    const excludeGlob = buildExcludeGlob();
    const folders = vscode.workspace.workspaceFolders;

    if (folders && folders.length > 0) {
      const uris = await vscode.workspace.findFiles('**/*', excludeGlob, maxResults);
      fileEntries = uris.map(makeFileEntry);
    } else {
      const allowlist = config.get('allowlistFolders', []);
      if (!allowlist || allowlist.length === 0) {
        fileEntries = [];
      } else {
        const results = [];
        for (const folder of allowlist) {
          try {
            const pattern = new vscode.RelativePattern(folder, '**/*');
            const found = await vscode.workspace.findFiles(pattern, excludeGlob, maxResults);
            results.push(...found);
          } catch { }
        }
        fileEntries = results.map(makeFileEntry);
      }
    }
    folderEntries = deriveFolderEntries(fileEntries);
  } finally {
    isRefreshing = false;
    // Run the queued refresh now that we're done
    if (pendingRefresh) {
      pendingRefresh = false;
      fullRefresh();
    }
  }
}

// Incremental add — O(1) amortized, no re-crawl
function addFileEntry(uri) {
  const uriStr = uri.toString();
  if (fileEntries.some(e => e.uri.toString() === uriStr)) return;

  const entry = makeFileEntry(uri);
  fileEntries.push(entry);

  // Add any new ancestor folders
  const existingFolders = new Set(folderEntries.map(f => f.relativePath));
  const parts = entry.relativePath.split('/');
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join('/');
    if (!existingFolders.has(dir)) {
      const lowerPath = dir.toLowerCase();
      const segs = dir.split('/');
      const basename = segs[segs.length - 1].toLowerCase();
      folderEntries.push({ relativePath: dir, lowerPath, basename });
      existingFolders.add(dir);
    }
  }
}

// Incremental remove — O(n) filter, still much cheaper than a full re-crawl
function removeFileEntry(uri) {
  const uriStr = uri.toString();
  fileEntries = fileEntries.filter(e => e.uri.toString() !== uriStr);
  folderEntries = deriveFolderEntries(fileEntries);
}

/**
 * Greedy match starting at a fixed index. Returns score or null if not all chars found.
 */
function fuzzyScoreFrom(lowerQuery, lowerPath, basenameStart, startIdx) {
  let qi = 0;
  let score = 0;
  let prevMatchIdx = -1;

  for (let i = startIdx; i < lowerPath.length && qi < lowerQuery.length; i++) {
    if (lowerPath[i] === lowerQuery[qi]) {
      if (prevMatchIdx === i - 1) score += 3;
      if (i === 0 || lowerPath[i - 1] === '/') score += 5;
      if (i >= basenameStart) score += 2;
      score += 1;
      prevMatchIdx = i;
      qi++;
    }
  }

  return qi < lowerQuery.length ? null : score;
}

/**
 * Try matching starting from every occurrence of the first query character and return
 * the best score. Pure left-to-right greedy misses better alignments — e.g. querying
 * "appconstants" against "config/initializers/app_constants.rb" would greedily anchor
 * on the 'a' in "initializers" instead of the 'a' that starts "app_constants".
 *
 * Post-match bonuses:
 *  +15  query exactly equals a full path segment  ("service" in "app/service/base.rb")
 *  +10  query exactly equals the basename without extension ("schema" in "schema.rb")
 */
function fuzzyScore(lowerQuery, { lowerPath, basename }) {
  const basenameStart = lowerPath.length - basename.length;
  const firstChar = lowerQuery[0];
  let bestScore = null;

  for (let i = 0; i < lowerPath.length; i++) {
    if (lowerPath[i] !== firstChar) continue;
    const score = fuzzyScoreFrom(lowerQuery, lowerPath, basenameStart, i);
    if (score !== null && (bestScore === null || score > bestScore)) {
      bestScore = score;
    }
  }

  if (bestScore === null) return null;

  // Exact segment match — rewards "service" matching the directory segment "service"
  // even when the basename is something else and gives no basename bonus
  for (const seg of lowerPath.split('/')) {
    if (seg === lowerQuery) { bestScore += 15; break; }
  }

  // Exact stem match — breaks ties like "schema.rb" vs "schema_migration.rb"
  const stem = basename.replace(/\.[^.]*$/, '');
  if (stem === lowerQuery) bestScore += 10;

  return bestScore;
}

function fuzzyFilterEntries(query, entries, maxItems = 50) {
  const lowerQuery = query.toLowerCase(); // one allocation, reused across all entries
  const scored = [];

  // Scan all entries — no early bail (bail would miss high-scoring late entries)
  for (const entry of entries) {
    const score = fuzzyScore(lowerQuery, entry);
    if (score !== null) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxItems);
}

const fileMentionProvider = {
  provideCompletionItems(document, position, _token, _context) {
    const lineText = document.lineAt(position.line).text;
    const beforeCursor = lineText.substring(0, position.character);
    const match = beforeCursor.match(/@([^\s@]*)$/);
    if (!match) return [];

    const query = match[1];

    if (!query) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const allowlist = getConfig().get('allowlistFolders', []);
      if ((!workspaceFolders || workspaceFolders.length === 0) && allowlist.length === 0) {
        const hint = new vscode.CompletionItem(
          'No workspace open — set fileMention.allowlistFolders in settings',
          vscode.CompletionItemKind.Text
        );
        hint.insertText = '';
        hint.filterText = '@';
        return [hint];
      }
      return [];
    }

    const replaceRange = new vscode.Range(
      new vscode.Position(position.line, position.character - match[0].length),
      position
    );

    // Setting filterText to the exact typed text (@query) means VS Code's internal filter
    // always passes our items through — our server-side fuzzy ranking is the sole filter.
    const typedText = match[0];

    const fileResults = fuzzyFilterEntries(query, fileEntries).map(({ entry, score }) => {
      const item = new vscode.CompletionItem(entry.relativePath, vscode.CompletionItemKind.File);
      item.insertText = entry.relativePath;
      item.filterText = typedText;
      item.sortText = '0' + String(100000 - score).padStart(6, '0');
      item.detail = 'file mention';
      item.range = replaceRange;
      return item;
    });

    const folderResults = fuzzyFilterEntries(query, folderEntries).map(({ entry, score }) => {
      const item = new vscode.CompletionItem(entry.relativePath, vscode.CompletionItemKind.Folder);
      item.insertText = entry.relativePath;
      item.filterText = typedText;
      item.sortText = '1' + String(100000 - score).padStart(6, '0');
      item.detail = 'folder mention';
      item.range = replaceRange;
      return item;
    });

    // isIncomplete: true — tells VS Code to re-call us on every keystroke instead of
    // caching results and re-filtering them with its own fuzzy algorithm, which would
    // layer a second (conflicting) filter on top of ours and hide valid matches.
    return new vscode.CompletionList([...fileResults, ...folderResults], true);
  }
};

let workspaceFolderChangeTimer = null;

function registerFileMentionProvider(context) {
  const triggerChar = getConfig().get('triggerCharacter', '@');

  fullRefresh();

  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  // Incremental updates — no full re-crawl per file event
  watcher.onDidCreate(uri => addFileEntry(uri));
  watcher.onDidDelete(uri => removeFileEntry(uri));
  context.subscriptions.push(watcher);

  // Debounce workspace folder changes — opening/closing folders can fire rapidly
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (workspaceFolderChangeTimer) clearTimeout(workspaceFolderChangeTimer);
      workspaceFolderChangeTimer = setTimeout(() => fullRefresh(), 500);
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [{ scheme: 'file' }, { scheme: 'untitled' }],
      fileMentionProvider,
      triggerChar
    )
  );
}

module.exports = { registerFileMentionProvider };
