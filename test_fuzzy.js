// Standalone evaluation of fuzzy scoring logic from fileMentionProvider.js
// Run with: node test_fuzzy.js

// ---- Scoring functions (kept in sync with fileMentionProvider.js) ----

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
  for (const seg of lowerPath.split('/')) {
    if (seg === lowerQuery) { bestScore += 15; break; }
  }

  // Exact stem match — breaks ties like "schema.rb" vs "schema_migration.rb"
  const stem = basename.replace(/\.[^.]*$/, '');
  if (stem === lowerQuery) bestScore += 10;

  return bestScore;
}

function makeEntry(relativePath) {
  const lowerPath = relativePath.toLowerCase();
  const segments = relativePath.split('/');
  const basename = segments[segments.length - 1].toLowerCase();
  return { relativePath, lowerPath, basename };
}

function rank(query, paths) {
  const lowerQuery = query.toLowerCase();
  const scored = paths
    .map(p => ({ path: p, score: fuzzyScore(lowerQuery, makeEntry(p)) }))
    .filter(x => x.score !== null);
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// ---- Test cases ----
// expected: paths in the order they should appear (at minimum, first entry must be correct)

const tests = [
  {
    // The original bug report
    name: '1. Basename exact match beats scattered full-path match',
    query: 'appconstants',
    paths: [
      'app/services/data_service/constants.rb',
      'config/initializers/app_constants.rb',
    ],
    expected: ['config/initializers/app_constants.rb'],
  },
  {
    // Consecutive chars in basename should beat scattered chars across the whole path
    name: '2. Consecutive basename match beats scattered full-path match',
    query: 'userctrl',
    paths: [
      'app/utils/render_controller.rb',
      'app/controllers/users_controller.rb',
    ],
    expected: ['app/controllers/users_controller.rb'],
  },
  {
    // A match that starts at a path segment boundary should score higher
    name: '3. Segment boundary start scores higher than mid-word match',
    query: 'service',
    paths: [
      'app/models/preserve_ice.rb',
      'app/service/base.rb',
    ],
    expected: ['app/service/base.rb'],
  },
  {
    // Validates the multi-start fix: first char appears many times, best window must win
    name: '4. Best alignment wins when first char appears multiple times in path',
    query: 'index',
    paths: [
      'internal/exceptions/data.rb',
      'app/assets/images/index.png',
    ],
    expected: ['app/assets/images/index.png'],
  },
  {
    // Shallower path with exact basename should beat deeper path with same basename
    name: '5. Shallower path beats deeper path for same basename',
    query: 'utils',
    paths: [
      'app/helpers/auth/token/utils.js',
      'utils.js',
    ],
    expected: ['utils.js'],
  },
  {
    // Query matching the start of the basename beats mid-basename match
    name: '6. Basename prefix match ranks above mid-basename match',
    query: 'route',
    paths: [
      'app/controllers/reroute_helper.rb',
      'config/routes.rb',
    ],
    expected: ['config/routes.rb'],
  },
  {
    // Matching in basename beats matching the same chars spread across directories
    name: '7. Basename coverage beats directory coverage for same chars',
    query: 'paymod',
    paths: [
      'payment/modules/base.rb',
      'app/models/payment_model.rb',
    ],
    expected: ['app/models/payment_model.rb'],
  },
  {
    // Exact filename should beat a longer filename that starts with the same query
    name: '8. Exact basename match ranks above longer basename with same prefix',
    query: 'schema',
    paths: [
      'app/models/schema_migration.rb',
      'db/schema.rb',
      'config/some_cache_manager.rb',
    ],
    expected: ['db/schema.rb'],
  },
  {
    // Consecutive match in basename should beat the same chars scattered in a long path
    name: '9. Consecutive chars in basename beat scattered chars in long path',
    query: 'api',
    paths: [
      'app/assets/images/avatar.png',
      'app/controllers/api_controller.rb',
    ],
    expected: ['app/controllers/api_controller.rb'],
  },
  {
    // Query spanning two segments: file where both segments start at boundaries wins
    name: '10. Both halves of query at segment boundaries beats mid-word match',
    query: 'appmod',
    paths: [
      'happy_module/config.rb',
      'app/models/base.rb',
    ],
    expected: ['app/models/base.rb'],
  },
];

// ---- Runner ----

let passed = 0;
let failed = 0;

for (const test of tests) {
  const results = rank(test.query, test.paths);
  const rankedPaths = results.map(r => r.path);

  const ok = test.expected.every((expectedPath, i) => rankedPaths[i] === expectedPath);

  if (ok) {
    console.log(`✅ PASS  ${test.name}`);
    passed++;
  } else {
    console.log(`❌ FAIL  ${test.name}`);
    console.log(`         Query: "${test.query}"`);
    console.log(`         Expected #1: ${test.expected[0]}`);
    console.log(`         Actual ranking:`);
    results.forEach((r, i) =>
      console.log(`           ${i + 1}. ${r.path}  (score: ${r.score})`)
    );
    failed++;
  }
}

console.log(`\n${passed}/${passed + failed} passed`);
