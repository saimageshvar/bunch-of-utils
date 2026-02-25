const vscode = require('vscode');

// Pre-computed cache entries — paid once at index time, not per keystroke
// fileEntries: { uri, relativePath, lowerPath, basename, segments, depth, isTest, stem }
// folderEntries: { relativePath, lowerPath, basename, segments, depth, isTest, stem }
let fileEntries = [];
let folderEntries = [];

// MRU tracking for recently selected files
let mruList = []; // [{relativePath, timestamp}]
const MAX_MRU_SIZE = 20;

let isRefreshing = false;
let pendingRefresh = false; // concurrency guard: queue at most one pending refresh
let extensionContext = null; // stored for workspace state access

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
  const depth = segments.length - 1;
  const stem = basename.replace(/\.[^.]*$/, '');
  
  // Detect test/spec files
  const isTest = /(_test\.|_spec\.|test_|\.test\.|\.spec\.|__tests__|\btest\b|\bspec\b)/i.test(relativePath);
  
  return { uri, relativePath, lowerPath, basename, segments, depth, isTest, stem };
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
        const depth = segs.length - 1;
        const stem = basename;
        const isTest = false;
        folders.push({ relativePath: dir, lowerPath, basename, segments: segs, depth, isTest, stem });
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
      const depth = segs.length - 1;
      const stem = basename;
      const isTest = false;
      folderEntries.push({ relativePath: dir, lowerPath, basename, segments: segs, depth, isTest, stem });
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
      if (i === 0 || lowerPath[i - 1] === '/' || lowerPath[i - 1] === '_') score += 5;
      if (i >= basenameStart) score += 2;
      score += 1;
      prevMatchIdx = i;
      qi++;
    }
  }

  return qi < lowerQuery.length ? null : score;
}

/**
 * Enhanced fuzzy scoring with segment-awareness, prefix boosts, depth penalty, and test detection.
 * Try matching starting from every occurrence of the first query character and return
 * the best score. Pure left-to-right greedy misses better alignments — e.g. querying
 * "appconstants" against "config/initializers/app_constants.rb" would greedily anchor
 * on the 'a' in "initializers" instead of the 'a' that starts "app_constants".
 */
function fuzzyScore(lowerQuery, entry, queryHintsTest = false) {
  const {
    lowerPath,
    basename,
    segments = [],
    depth = 0,
    isTest = false,
    stem = basename,
  } = entry;
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
  for (const seg of segments) {
    if (seg.toLowerCase() === lowerQuery) { bestScore += 15; break; }
  }

  // Basename prefix bonus — strong signal for intent
  if (basename.startsWith(lowerQuery)) {
    bestScore += 12;
  }

  // Exact stem match — breaks ties like "schema.rb" vs "schema_migration.rb"
  if (stem === lowerQuery) {
    bestScore += 10;
  } else if (stem.endsWith(lowerQuery)) {
    bestScore += 7;
  }

  // Segment token matching — reward ordered segment prefix matches
  // e.g., "appmod" should boost "app/models/..." over "config/app_module"
  const queryTokens = lowerQuery.split(/[\/\-_]/).filter(Boolean);
  if (queryTokens.length > 1) {
    let tokenMatchCount = 0;
    let segIdx = 0;
    for (const token of queryTokens) {
      while (segIdx < segments.length) {
        if (segments[segIdx].toLowerCase().startsWith(token)) {
          tokenMatchCount++;
          segIdx++;
          break;
        }
        segIdx++;
      }
    }
    if (tokenMatchCount > 1) {
      bestScore += tokenMatchCount * 4;
    }
  }

  // Mild depth penalty — prefer shallower paths when scores are close
  bestScore -= Math.min(depth * 0.5, 3);

  // Path length penalty — prefer shorter paths
  bestScore -= Math.min(lowerPath.length * 0.02, 2);

  // Test/spec penalty unless query hints test intent
  if (isTest && !queryHintsTest) {
    bestScore -= 5;
  }

  return bestScore;
}

function fuzzyFilterEntries(query, fileEntries, folderEntries, maxItems = 50) {
  const lowerQuery = query.toLowerCase();
  const queryHintsTest = /test|spec|__tests__/.test(lowerQuery);
  const scored = [];

  // Score all files
  for (const entry of fileEntries) {
    const score = fuzzyScore(lowerQuery, entry, queryHintsTest);
    if (score !== null) {
      scored.push({ entry, score, isFile: true });
    }
  }

  // Score all folders
  for (const entry of folderEntries) {
    const score = fuzzyScore(lowerQuery, entry, queryHintsTest);
    if (score !== null) {
      scored.push({ entry, score, isFile: false });
    }
  }

  // Single combined ranking with stable tie-break:
  // 1. Score (desc)
  // 2. Basename prefix match (desc)
  // 3. File-over-folder for exact basename match
  // 4. Depth (asc)
  // 5. Path length (asc)
  // 6. Lexicographic (asc)
  scored.sort((a, b) => {
    // Primary: score descending
    if (a.score !== b.score) return b.score - a.score;

    // Secondary: basename prefix match
    const aBasenamePrefix = a.entry.basename.startsWith(lowerQuery) ? 1 : 0;
    const bBasenamePrefix = b.entry.basename.startsWith(lowerQuery) ? 1 : 0;
    if (aBasenamePrefix !== bBasenamePrefix) return bBasenamePrefix - aBasenamePrefix;

    // Tertiary: file-over-folder tie rule (only when basenames match exactly)
    if (a.entry.basename === b.entry.basename && a.isFile !== b.isFile) {
      return a.isFile ? -1 : 1;
    }

    // Quaternary: depth ascending (shallower first)
    if (a.entry.depth !== b.entry.depth) return a.entry.depth - b.entry.depth;

    // Quinary: path length ascending (shorter first)
    const aLen = a.entry.lowerPath.length;
    const bLen = b.entry.lowerPath.length;
    if (aLen !== bLen) return aLen - bLen;

    // Final: lexicographic ascending
    return a.entry.relativePath.localeCompare(b.entry.relativePath);
  });

  return scored.slice(0, maxItems);
}

// MRU management
function loadMRU() {
  if (!extensionContext) return [];
  const stored = extensionContext.workspaceState.get('fileMentionMRU', []);
  return stored.filter(item => item && item.relativePath); // validate structure
}

function saveMRU(list) {
  if (!extensionContext) return;
  extensionContext.workspaceState.update('fileMentionMRU', list);
}

function addToMRU(relativePath) {
  mruList = mruList.filter(item => item.relativePath !== relativePath);
  mruList.unshift({ relativePath, timestamp: Date.now() });
  if (mruList.length > MAX_MRU_SIZE) {
    mruList = mruList.slice(0, MAX_MRU_SIZE);
  }
  saveMRU(mruList);
}

function getDefaultSuggestions() {
  // For bare trigger, show MRU-boosted suggestions
  const mruPaths = new Set(mruList.map(m => m.relativePath));
  const scored = [];

  // Score MRU entries with recency boost
  for (const entry of fileEntries) {
    if (mruPaths.has(entry.relativePath)) {
      const mruIndex = mruList.findIndex(m => m.relativePath === entry.relativePath);
      const recencyBoost = 100 - mruIndex * 3; // Recent = higher boost
      scored.push({ entry, score: recencyBoost, isFile: true });
    }
  }

  // Add some high-value non-MRU files (shallow, short paths, not tests)
  for (const entry of fileEntries) {
    if (!mruPaths.has(entry.relativePath) && scored.length < 30) {
      const score = 50 - entry.depth * 2 - entry.lowerPath.length * 0.1 - (entry.isTest ? 10 : 0);
      if (score > 30) {
        scored.push({ entry, score, isFile: true });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 50);
}

const fileMentionProvider = {
  provideCompletionItems(document, position, _token, _context) {
    const triggerChar = getConfig().get('triggerCharacter', '@');
    const lineText = document.lineAt(position.line).text;
    const beforeCursor = lineText.substring(0, position.character);
    
    // Fix: use configurable trigger character in regex
    const escapedTrigger = triggerChar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escapedTrigger + '([^\\s' + escapedTrigger + ']*)$');
    const match = beforeCursor.match(pattern);
    if (!match) return [];

    const query = match[1];

    const replaceRange = new vscode.Range(
      new vscode.Position(position.line, position.character - match[0].length),
      position
    );
    const typedText = match[0];

    // Handle bare trigger (no query)
    if (!query) {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      const allowlist = getConfig().get('allowlistFolders', []);
      if ((!workspaceFolders || workspaceFolders.length === 0) && allowlist.length === 0) {
        const hint = new vscode.CompletionItem(
          'No workspace open — set fileMention.allowlistFolders in settings',
          vscode.CompletionItemKind.Text
        );
        hint.insertText = '';
        hint.filterText = typedText;
        return [hint];
      }

      // Show MRU-based default suggestions
      const defaults = getDefaultSuggestions();
      return new vscode.CompletionList(
        defaults.map(({ entry, score }, idx) => {
          const item = new vscode.CompletionItem(
            entry.relativePath,
            vscode.CompletionItemKind.File
          );
          item.insertText = entry.relativePath;
          item.filterText = typedText;
          item.sortText = String(idx).padStart(4, '0');
          item.detail = mruList.some(m => m.relativePath === entry.relativePath)
            ? 'recent file'
            : 'file mention';
          item.range = replaceRange;
          return item;
        }),
        true
      );
    }

    // Query-based fuzzy filtering with combined ranking
    const results = fuzzyFilterEntries(query, fileEntries, folderEntries);

    const items = results.map(({ entry, score, isFile }, idx) => {
      const item = new vscode.CompletionItem(
        entry.relativePath,
        isFile ? vscode.CompletionItemKind.File : vscode.CompletionItemKind.Folder
      );
      item.insertText = entry.relativePath;
      item.filterText = typedText;
      item.sortText = String(idx).padStart(4, '0');
      item.detail = isFile ? 'file mention' : 'folder mention';
      item.range = replaceRange;
      
      // Track selection for MRU
      if (isFile) {
        item.command = {
          command: 'fileMention.trackSelection',
          title: '',
          arguments: [entry.relativePath]
        };
      }
      
      return item;
    });

    return new vscode.CompletionList(items, true);
  }
};

let workspaceFolderChangeTimer = null;

function registerFileMentionProvider(context) {
  extensionContext = context;
  mruList = loadMRU();
  
  const triggerChar = getConfig().get('triggerCharacter', '@');

  // Register MRU tracking command
  context.subscriptions.push(
    vscode.commands.registerCommand('fileMention.trackSelection', (relativePath) => {
      addToMRU(relativePath);
    })
  );

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
      triggerChar,
      '/',
      '.'
    )
  );
}

module.exports = { registerFileMentionProvider };
