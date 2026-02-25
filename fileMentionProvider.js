const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');

// Pre-computed cache entries — paid once at index time, not per keystroke
// fileEntries: { uri, relativePath, lowerPath, basename, segments, depth, isTest, stem }
let fileEntries = [];

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

function gitLsFiles(cwd) {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['ls-files'],
      { cwd, maxBuffer: 1024 * 1024 * 64 },
      (error, stdout) => {
        if (error) {
          resolve([]);
          return;
        }

        const lines = stdout
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean);

        const uris = lines.map(rel => vscode.Uri.file(path.join(cwd, rel)));
        resolve(uris);
      }
    );
  });
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
      // Prefer git ls-files for complete, fast, deterministic indexing in large repos.
      // Fall back to workspace.findFiles when git is unavailable.
      const gitUris = [];
      for (const folder of folders) {
        const cwd = folder.uri.fsPath;
        const listed = await gitLsFiles(cwd);
        gitUris.push(...listed);
      }

      let uris;
      if (gitUris.length > 0) {
        const seen = new Set();
        uris = gitUris.filter(uri => {
          const key = uri.toString();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else {
        uris = await vscode.workspace.findFiles('**/*', excludeGlob, maxResults);
      }

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
}

// Incremental remove — O(n) filter, still much cheaper than a full re-crawl
function removeFileEntry(uri) {
  const uriStr = uri.toString();
  fileEntries = fileEntries.filter(e => e.uri.toString() !== uriStr);
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
    let firstMatchedSegIdx = -1;
    let lastMatchedSegIdx = -1;
    for (const token of queryTokens) {
      while (segIdx < segments.length) {
        if (segments[segIdx].toLowerCase().startsWith(token)) {
          if (firstMatchedSegIdx === -1) firstMatchedSegIdx = segIdx;
          lastMatchedSegIdx = segIdx;
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

    // Penalize missing query tokens for path-like queries.
    // This makes `app/controller` strongly prefer paths containing both
    // app + controller segments over paths that only match one token.
    const unmatchedTokens = queryTokens.length - tokenMatchCount;
    if (unmatchedTokens > 0) {
      bestScore -= unmatchedTokens * 8;
    }

    // Prefer paths where the first matched token appears earlier.
    // Example: `app/...` should beat `vendor/.../app/...` for query `app/...`.
    if (firstMatchedSegIdx > 0) {
      bestScore -= firstMatchedSegIdx * 4;
    }

    // Prefer tighter token spans (tokens close together in path structure).
    if (firstMatchedSegIdx !== -1 && lastMatchedSegIdx !== -1) {
      const span = lastMatchedSegIdx - firstMatchedSegIdx;
      const minSpan = tokenMatchCount > 0 ? tokenMatchCount - 1 : 0;
      const extraSpan = Math.max(0, span - minSpan);
      if (extraSpan > 0) {
        bestScore -= extraSpan * 2;
      }
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

function fuzzyFilterEntries(query, fileEntries, maxItems = 50) {
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

  // Single combined ranking with stable tie-break:
  // 1. Score (desc)
  // 2. Basename prefix match (desc)
  // 3. Depth (asc)
  // 4. Path length (asc)
  // 5. Lexicographic (asc)
  scored.sort((a, b) => {
    // Primary: score descending
    if (a.score !== b.score) return b.score - a.score;

    // Secondary: basename prefix match
    const aBasenamePrefix = a.entry.basename.startsWith(lowerQuery) ? 1 : 0;
    const bBasenamePrefix = b.entry.basename.startsWith(lowerQuery) ? 1 : 0;
    if (aBasenamePrefix !== bBasenamePrefix) return bBasenamePrefix - aBasenamePrefix;

    // Tertiary: depth ascending (shallower first)
    if (a.entry.depth !== b.entry.depth) return a.entry.depth - b.entry.depth;

    // Quaternary: path length ascending (shorter first)
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
    const results = fuzzyFilterEntries(query, fileEntries);

    const items = results.map(({ entry }, idx) => {
      const item = new vscode.CompletionItem(
        entry.relativePath,
        vscode.CompletionItemKind.File
      );
      item.insertText = entry.relativePath;
      item.filterText = typedText;
      item.sortText = String(idx).padStart(4, '0');
      item.detail = 'file mention';
      item.range = replaceRange;

      // Track selection for MRU
      item.command = {
        command: 'fileMention.trackSelection',
        title: '',
        arguments: [entry.relativePath]
      };

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
