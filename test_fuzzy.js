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
      if (i === 0 || lowerPath[i - 1] === '/' || lowerPath[i - 1] === '_') score += 5;
      if (i >= basenameStart) score += 2;
      score += 1;
      prevMatchIdx = i;
      qi++;
    }
  }

  return qi < lowerQuery.length ? null : score;
}

function fuzzyScore(lowerQuery, entry, queryHintsTest = false) {
  const { lowerPath, basename, segments, depth, isTest, stem } = entry;
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

function makeEntry(relativePath) {
  const lowerPath = relativePath.toLowerCase();
  const segments = relativePath.split('/');
  const basename = segments[segments.length - 1].toLowerCase();
  const depth = segments.length - 1;
  const stem = basename.replace(/\.[^.]*$/, '');
  const isTest = /(_test\.|_spec\.|test_|\.test\.|\.spec\.|__tests__|\\btest\\b|\\bspec\\b)/i.test(relativePath);
  return { relativePath, lowerPath, basename, segments, depth, isTest, stem };
}

function rank(query, paths) {
  const lowerQuery = query.toLowerCase();
  const queryHintsTest = /test|spec|__tests__/.test(lowerQuery);
  const scored = paths
    .map(p => ({ path: p, score: fuzzyScore(lowerQuery, makeEntry(p), queryHintsTest) }))
    .filter(x => x.score !== null);
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    // Tie-break: shorter path, then lexicographic
    const aLen = a.path.length;
    const bLen = b.path.length;
    if (aLen !== bLen) return aLen - bLen;
    return a.path.localeCompare(b.path);
  });
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
  {
    // app file should beat its test counterpart for common Rails queries
    name: '11. Source file beats _test counterpart (stem suffix bonus)',
    query: 'controller',
    paths: [
      'test/controllers/users_controller_test.rb',
      'app/controllers/users_controller.rb',
    ],
    expected: ['app/controllers/users_controller.rb'],
  },
  {
    // exact source file should beat test file even when test volume is high
    name: '12. Source model file beats test file for model name query',
    query: 'user',
    paths: [
      'test/models/user_test.rb',
      'test/factories/user_factory.rb',
      'app/models/user.rb',
    ],
    expected: ['app/models/user.rb'],
  },
  {
    // Basename prefix bonus should elevate prefix matches
    name: '13. Basename prefix match beats mid-basename match',
    query: 'user',
    paths: [
      'app/models/new_user_form.rb',
      'app/models/user.rb',
    ],
    expected: ['app/models/user.rb'],
  },
  {
    // Segment token matching should work for structured queries
    name: '14. Segment token query "app/mod" favors "app/models" over scattered match',
    query: 'app/mod',
    paths: [
      'happy_application/modules/base.rb',
      'app/models/base.rb',
    ],
    expected: ['app/models/base.rb'],
  },
  {
    // Shallower paths preferred when scores are close (depth penalty)
    name: '15. Shallower path preferred for similar matches',
    query: 'util',
    paths: [
      'app/services/auth/helpers/utilities.rb',
      'app/utilities.rb',
    ],
    expected: ['app/utilities.rb'],
  },
  {
    // Test penalty should be overridden when query hints test intent
    name: '16. Test file preferred when query hints test intent',
    query: 'usertest',
    paths: [
      'app/models/user.rb',
      'test/models/user_test.rb',
    ],
    expected: ['test/models/user_test.rb'],
  },
  {
    // Verify test penalty works for neutral queries
    name: '17. Source file preferred over test file for neutral query',
    query: 'payment',
    paths: [
      'test/models/payment_spec.rb',
      'app/models/payment.rb',
    ],
    expected: ['app/models/payment.rb'],
  },
  {
    // Path-like query should strongly prefer app/controllers over test/controllers
    name: '18. app/controller prefers app paths over test paths',
    query: 'app/controller',
    paths: [
      'test/controllers/users_controller_test.rb',
      'app/controllers/users_controller.rb',
      'spec/controllers/users_controller_spec.rb',
    ],
    expected: ['app/controllers/users_controller.rb'],
  },
  {
    // Root-intent query should prefer top-level app path over deep vendor nested app path
    name: '19. app/controller/userscontroller prefers top-level app over vendor nested app',
    query: 'app/controll/userscontroller',
    paths: [
      'vendor/engines/chronus_mentor_api/app/controllers/api/v2/users_controller.rb',
      'app/controllers/users_controller.rb',
    ],
    expected: ['app/controllers/users_controller.rb'],
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
