const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { atomicWriteJson, atomicWriteFile, ensureDir, readJsonSafe } = require('./atomic');

let babelParser = null;
try {
  babelParser = require('@babel/parser');
} catch (_) {
  babelParser = null;
}

const GRAPH_VERSION = 1;

const DEFAULT_IGNORES = [
  '.git',
  '.codexmap',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  'venv',
  '.venv',
  '__pycache__',
  '.DS_Store',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '*.map',
  '*.min.js',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.svg',
  '*.ico',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
  '*.pdf',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.mp4',
  '*.mov',
  '*.mp3',
  '*.log',
];

const LANGUAGE_BY_EXT = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.java': 'java',
  '.cs': 'csharp',
  '.php': 'php',
  '.sql': 'sql',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.sh': 'shell',
};

const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.go', '.rs',
  '.rb', '.java', '.cs', '.php', '.sql', '.html', '.css', '.scss', '.sh',
]);

const TEXT_EXTENSIONS = new Set([
  ...CODE_EXTENSIONS,
  '.json', '.yaml', '.yml', '.toml', '.md', '.mdx', '.txt', '.env', '.example',
]);

const FRAMEWORK_HINTS = {
  express: 'Express',
  react: 'React',
  next: 'Next.js',
  vite: 'Vite',
  vue: 'Vue',
  svelte: 'Svelte',
  pg: 'PostgreSQL',
  prisma: 'Prisma',
  mongoose: 'MongoDB',
  fastify: 'Fastify',
  koa: 'Koa',
  django: 'Django',
  flask: 'Flask',
  pytest: 'pytest',
  vitest: 'Vitest',
  jest: 'Jest',
  tailwindcss: 'Tailwind CSS',
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeRel(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function graphDir(projectRoot) {
  return path.join(projectRoot, '.codexmap');
}

function graphPath(projectRoot) {
  return path.join(graphDir(projectRoot), 'knowledge-graph.json');
}

function projectIndexPath(projectRoot) {
  return path.join(graphDir(projectRoot), 'PROJECT_INDEX.md');
}

function learnPath(projectRoot) {
  return path.join(graphDir(projectRoot), 'learn.md');
}

function detectLanguage(filePath) {
  const base = path.basename(filePath);
  if (base === 'Dockerfile') return 'dockerfile';
  return LANGUAGE_BY_EXT[path.extname(filePath).toLowerCase()] || 'text';
}

function nodeTypeForFile(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  const base = path.basename(relPath).toLowerCase();
  if (ext === '.md' || ext === '.mdx' || base.includes('readme')) return 'document';
  if (['.json', '.yaml', '.yml', '.toml', '.env'].includes(ext) || base.includes('dockerfile')) return 'config';
  if (relPath.includes('/migrations/') || ext === '.sql') return 'table';
  return 'file';
}

function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`(^|/)${escaped}($|/)`);
}

function readIgnorePatterns(projectRoot) {
  const file = path.join(projectRoot, '.gitignore');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'));
}

function shouldIgnore(relPath, options = {}) {
  const normalized = normalizeRel(relPath);
  if (!options.includeOutput && (normalized === 'output' || normalized.startsWith('output/'))) return true;
  const patterns = [...DEFAULT_IGNORES, ...(options.extraIgnores || [])];
  return patterns.some((pattern) => {
    const clean = normalizeRel(pattern).replace(/\/$/, '');
    if (!clean) return false;
    if (clean.includes('*')) return globToRegex(clean).test(normalized);
    return normalized === clean || normalized.startsWith(`${clean}/`) || normalized.includes(`/${clean}/`);
  });
}

function isProbablyText(relPath) {
  const ext = path.extname(relPath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  return ['Dockerfile', '.env.example'].includes(path.basename(relPath));
}

function listProjectFiles(projectRoot, options = {}) {
  const maxFiles = Number(options.maxFiles || 500);
  const extraIgnores = readIgnorePatterns(projectRoot);
  const files = [];

  function walk(dir) {
    if (files.length >= maxFiles) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const abs = path.join(dir, entry.name);
      const rel = normalizeRel(path.relative(projectRoot, abs));
      if (shouldIgnore(rel, { ...options, extraIgnores })) continue;

      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && isProbablyText(rel)) {
        files.push(rel);
      }
    }
  }

  walk(projectRoot);
  return files;
}

function readTextFile(projectRoot, relPath, maxBytes = 160000) {
  const abs = path.join(projectRoot, relPath);
  const stat = fs.statSync(abs);
  if (stat.size > maxBytes) {
    const fd = fs.openSync(abs, 'r');
    const buffer = Buffer.alloc(maxBytes);
    fs.readSync(fd, buffer, 0, maxBytes, 0);
    fs.closeSync(fd);
    return buffer.toString('utf8');
  }
  return fs.readFileSync(abs, 'utf8');
}

function lineRangeFor(node) {
  if (!node || !node.loc) return undefined;
  return {
    start: node.loc.start.line,
    end: node.loc.end.line,
  };
}

function functionName(node, parent) {
  if (!node) return null;
  if (node.id && node.id.name) return node.id.name;
  if (parent && parent.type === 'VariableDeclarator' && parent.id && parent.id.name) return parent.id.name;
  if (parent && parent.type === 'AssignmentExpression' && parent.left) {
    return parent.left.name || parent.left.property?.name || parent.left.property?.value || null;
  }
  if (parent && parent.type === 'ObjectProperty' && parent.key) return parent.key.name || parent.key.value || null;
  if (parent && parent.type === 'ClassMethod' && parent.key) return parent.key.name || parent.key.value || null;
  if (parent && parent.type === 'ObjectMethod' && parent.key) return parent.key.name || parent.key.value || null;
  return null;
}

function walkAst(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') return;
  visitor(node, parent);
  for (const key of Object.keys(node)) {
    if (['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach((child) => walkAst(child, visitor, node));
    } else if (value && typeof value === 'object' && value.type) {
      walkAst(value, visitor, node);
    }
  }
}

function parseBabelFile(relPath, content) {
  if (!babelParser) return { symbols: [], imports: [] };
  let ast;
  try {
    ast = babelParser.parse(content, {
      sourceType: 'unambiguous',
      errorRecovery: true,
      plugins: [
        'jsx',
        'typescript',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'dynamicImport',
        'decorators-legacy',
        'topLevelAwait',
      ],
    });
  } catch (_) {
    return { symbols: [], imports: [] };
  }

  const imports = [];
  const symbols = [];
  const seen = new Set();

  walkAst(ast.program, (node, parent) => {
    if (node.type === 'ImportDeclaration' && node.source?.value) imports.push(node.source.value);
    if (node.type === 'ExportNamedDeclaration' && node.source?.value) imports.push(node.source.value);
    if (node.type === 'ExportAllDeclaration' && node.source?.value) imports.push(node.source.value);
    if (node.type === 'CallExpression' && node.callee?.name === 'require' && node.arguments?.[0]?.value) {
      imports.push(node.arguments[0].value);
    }

    const isFunction = [
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'ClassMethod',
      'ObjectMethod',
    ].includes(node.type);
    const isClass = node.type === 'ClassDeclaration';

    if (!isFunction && !isClass) return;
    const rawName = isClass ? node.id?.name : functionName(node, parent);
    const excerpt = content.slice(node.start || 0, node.end || 0);
    const name = rawName || `${isClass ? 'anonymous_class' : 'anonymous'}_${sha256(excerpt).slice(0, 8)}`;
    const dedupeKey = `${isClass ? 'class' : 'function'}:${name}:${sha256(excerpt).slice(0, 8)}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    symbols.push({
      type: isClass ? 'class' : 'function',
      name,
      lineRange: lineRangeFor(node),
      excerpt: excerpt.slice(0, 2000),
    });
  });

  return { symbols, imports: [...new Set(imports)] };
}

function parseLineBasedFile(relPath, content) {
  const imports = [];
  const symbols = [];
  const lines = content.split(/\r?\n/);
  const ext = path.extname(relPath).toLowerCase();

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const importMatch = trimmed.match(/^(?:from\s+([\w.]+)\s+import|import\s+([\w./-]+)|require\(["'](.+?)["']\))/);
    if (importMatch) imports.push(importMatch[1] || importMatch[2] || importMatch[3]);

    let match = null;
    if (ext === '.py') match = trimmed.match(/^def\s+([A-Za-z_][\w]*)\s*\(/) || trimmed.match(/^class\s+([A-Za-z_][\w]*)/);
    if (ext === '.go') match = trimmed.match(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_][\w]*)\s*\(/);
    if (ext === '.rs') match = trimmed.match(/^(?:pub\s+)?fn\s+([A-Za-z_][\w]*)\s*\(/);
    if (ext === '.rb') match = trimmed.match(/^def\s+([A-Za-z_][\w!?]*)/);
    if (!match) return;
    symbols.push({
      type: trimmed.startsWith('class ') ? 'class' : 'function',
      name: match[1],
      lineRange: { start: index + 1, end: index + 1 },
      excerpt: lines.slice(index, Math.min(index + 24, lines.length)).join('\n'),
    });
  });

  return { symbols, imports: [...new Set(imports)] };
}

function parseStructure(relPath, content) {
  const ext = path.extname(relPath).toLowerCase();
  if (['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'].includes(ext)) {
    return parseBabelFile(relPath, content);
  }
  return parseLineBasedFile(relPath, content);
}

function firstHeading(content) {
  const heading = content.split(/\r?\n/).find((line) => /^#{1,3}\s+/.test(line.trim()));
  return heading ? heading.replace(/^#{1,3}\s+/, '').trim() : '';
}

function summarizeFile(relPath, content, symbols) {
  const base = path.basename(relPath);
  const ext = path.extname(relPath).toLowerCase();
  if (base.toLowerCase().includes('readme') || ext === '.md' || ext === '.mdx') {
    return firstHeading(content) || `Documentation file ${relPath}`;
  }
  if (base === 'package.json') {
    try {
      const pkg = JSON.parse(content);
      return `Node package manifest for ${pkg.name || 'this project'}`;
    } catch (_) {
      return 'Node package manifest';
    }
  }
  if (symbols.length > 0) {
    return `${base} defines ${symbols.slice(0, 5).map((symbol) => symbol.name).join(', ')}`;
  }
  return `${nodeTypeForFile(relPath)} file ${relPath}`;
}

function classifyLayer(relPath) {
  const normalized = relPath.toLowerCase();
  if (normalized.includes('/routes/') || normalized.includes('/api/') || normalized.includes('/controllers/')) return 'api';
  if (normalized.includes('/middleware/') || normalized.includes('/auth/')) return 'auth';
  if (normalized.includes('/db') || normalized.includes('/models/') || normalized.includes('/schema') || normalized.includes('prisma')) return 'data';
  if (normalized.includes('/components/') || normalized.includes('/pages/') || normalized.includes('/ui/') || normalized.endsWith('.css') || normalized.endsWith('.html')) return 'ui';
  if (normalized.includes('/test') || normalized.includes('.test.') || normalized.includes('.spec.')) return 'tests';
  if (normalized.includes('/docs/') || normalized.endsWith('.md') || path.basename(normalized).includes('readme')) return 'docs';
  if (normalized.includes('docker') || normalized.includes('deploy') || normalized.endsWith('.yml') || normalized.endsWith('.yaml')) return 'infra';
  if (normalized.includes('/lib/') || normalized.includes('/utils/') || normalized.includes('/shared/')) return 'support';
  return 'core';
}

function complexityFromSymbols(symbols, content) {
  const branchCount = (content.match(/\b(if|else\s+if|for|while|switch|case|catch)\b|\?|&&|\|\|/g) || []).length;
  if (branchCount > 12 || symbols.length > 12) return 'complex';
  if (branchCount > 4 || symbols.length > 4) return 'moderate';
  return 'simple';
}

function detectFrameworks(projectRoot, files) {
  const found = new Set();
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.peerDependencies || {}),
      };
      Object.keys(deps).forEach((dep) => {
        if (FRAMEWORK_HINTS[dep]) found.add(FRAMEWORK_HINTS[dep]);
      });
    } catch (_) {
      // Ignore invalid manifests; the graph still works.
    }
  }
  if (files.some((file) => file.includes('docker-compose'))) found.add('Docker Compose');
  if (files.some((file) => file.endsWith('go.mod'))) found.add('Go modules');
  if (files.some((file) => file.endsWith('pyproject.toml'))) found.add('Python packaging');
  return [...found].sort();
}

function getGitCommit(projectRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 3000,
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function resolveInternalImport(fromRel, specifier, fileSet) {
  if (!specifier || (!specifier.startsWith('.') && !specifier.startsWith('/'))) return null;
  const fromDir = path.dirname(fromRel);
  const base = normalizeRel(path.normalize(path.join(fromDir, specifier)));
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.py`,
    `${base}/index.js`,
    `${base}/index.jsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ];
  return candidates.find((candidate) => fileSet.has(candidate)) || null;
}

function buildProjectGraph(projectRoot, options = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const files = listProjectFiles(root, options);
  const fileSet = new Set(files);
  const nodes = [];
  const edges = [];
  const languages = new Set();
  const layerMap = new Map();
  const fileImports = new Map();

  for (const relPath of files) {
    let content = '';
    try {
      content = readTextFile(root, relPath);
    } catch (_) {
      continue;
    }
    const language = detectLanguage(relPath);
    if (language !== 'text') languages.add(language);
    const structure = parseStructure(relPath, content);
    const fingerprint = `sha256:${sha256(content)}`;
    const layerId = classifyLayer(relPath);
    const fileId = `file:${relPath}`;
    const fileNode = {
      id: fileId,
      type: nodeTypeForFile(relPath),
      name: path.basename(relPath),
      filePath: relPath,
      summary: summarizeFile(relPath, content, structure.symbols),
      tags: [language, layerId].filter(Boolean),
      complexity: complexityFromSymbols(structure.symbols, content),
      language,
      layer: layerId,
      fingerprint,
      excerpt: content.slice(0, 1200),
    };
    nodes.push(fileNode);

    if (!layerMap.has(layerId)) layerMap.set(layerId, new Set());
    layerMap.get(layerId).add(fileId);

    for (const symbol of structure.symbols) {
      const symbolHash = sha256(`${relPath}:${symbol.name}:${symbol.excerpt}`).slice(0, 8);
      const symbolId = `${symbol.type}:${relPath}:${symbol.name}:${symbolHash}`;
      nodes.push({
        id: symbolId,
        type: symbol.type,
        name: symbol.name,
        filePath: relPath,
        lineRange: symbol.lineRange,
        summary: `${symbol.type} ${symbol.name} in ${relPath}`,
        tags: [language, layerId, symbol.type],
        complexity: 'simple',
        language,
        layer: layerId,
        fingerprint: `sha256:${sha256(symbol.excerpt)}`,
        excerpt: symbol.excerpt,
      });
      edges.push({
        source: fileId,
        target: symbolId,
        type: 'contains',
        direction: 'forward',
        weight: 1,
      });
      layerMap.get(layerId).add(symbolId);
    }

    fileImports.set(relPath, structure.imports);
  }

  for (const [fromRel, imports] of fileImports.entries()) {
    for (const specifier of imports) {
      const targetRel = resolveInternalImport(fromRel, specifier, fileSet);
      if (!targetRel) continue;
      edges.push({
        source: `file:${fromRel}`,
        target: `file:${targetRel}`,
        type: 'imports',
        direction: 'forward',
        weight: 0.8,
      });
    }
  }

  const layers = [...layerMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, nodeIds]) => ({
      id,
      name: layerName(id),
      description: layerDescription(id),
      nodeIds: [...nodeIds].sort(),
    }));

  const projectName = path.basename(root);
  const readme = files.find((file) => path.basename(file).toLowerCase().startsWith('readme'));
  const description = readme ? summarizeFile(readme, readTextFile(root, readme, 12000), []) : `Knowledge graph for ${projectName}`;

  return {
    version: GRAPH_VERSION,
    project: {
      name: projectName,
      description,
      root,
      languages: [...languages].sort(),
      frameworks: detectFrameworks(root, files),
      analyzedAt: new Date().toISOString(),
      gitCommitHash: getGitCommit(root),
    },
    nodes,
    edges,
    layers,
    tour: buildTour(nodes, layers),
    meta: {
      fileCount: files.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      maxFiles: Number(options.maxFiles || 500),
      generatedBy: 'codexmap index',
    },
  };
}

function layerName(id) {
  const names = {
    api: 'API Surface',
    auth: 'Authentication',
    core: 'Core Logic',
    data: 'Data Layer',
    docs: 'Documentation',
    infra: 'Infrastructure',
    support: 'Shared Support',
    tests: 'Tests',
    ui: 'User Interface',
  };
  return names[id] || id;
}

function layerDescription(id) {
  const descriptions = {
    api: 'Routes, controllers, and HTTP-facing application boundaries.',
    auth: 'Authentication, authorization, middleware, and identity logic.',
    core: 'Primary application logic that does not fit a narrower layer.',
    data: 'Database access, schemas, models, and persistence concerns.',
    docs: 'Documentation and project knowledge intended for humans.',
    infra: 'Deployment, containers, CI, and operational configuration.',
    support: 'Utilities, shared helpers, and cross-cutting support code.',
    tests: 'Automated tests and test fixtures.',
    ui: 'Browser UI, styles, pages, and frontend components.',
  };
  return descriptions[id] || 'Project components grouped by path and role.';
}

function buildTour(nodes, layers) {
  const entryFiles = nodes
    .filter((node) => node.type === 'file' && /(^|\/)(index|main|server|app)\.[\w]+$/.test(node.filePath || ''))
    .slice(0, 4);
  const tour = [];
  if (entryFiles.length > 0) {
    tour.push({
      order: 1,
      title: 'Start at the entry points',
      description: 'These files are likely runtime entry points or application roots.',
      nodeIds: entryFiles.map((node) => node.id),
    });
  }
  layers.slice(0, 5).forEach((layer, index) => {
    tour.push({
      order: tour.length + 1,
      title: `Understand ${layer.name}`,
      description: layer.description,
      nodeIds: layer.nodeIds.slice(0, 8),
    });
  });
  return tour;
}

function saveProjectGraph(projectRoot, graph) {
  ensureDir(graphDir(projectRoot));
  atomicWriteJson(graphPath(projectRoot), graph);
  atomicWriteFile(projectIndexPath(projectRoot), formatProjectIndex(graph), 'utf8');
  atomicWriteFile(learnPath(projectRoot), formatOnboardingGuide(graph), 'utf8');
}

function indexProject(projectRoot, options = {}) {
  const root = path.resolve(projectRoot || process.cwd());
  const graph = buildProjectGraph(root, options);
  saveProjectGraph(root, graph);
  return {
    graph,
    paths: {
      graph: graphPath(root),
      projectIndex: projectIndexPath(root),
      learn: learnPath(root),
    },
  };
}

function loadProjectGraph(projectRoot) {
  const root = path.resolve(projectRoot || process.cwd());
  const graph = readJsonSafe(graphPath(root), null);
  if (!graph || !Array.isArray(graph.nodes)) {
    throw new Error(`No CodexMap knowledge graph found at ${graphPath(root)}. Run "codexmap index" first.`);
  }
  return graph;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9_.$/-]+/)
    .filter((token) => token.length > 1);
}

function scoreNode(node, queryTokens) {
  const haystack = tokenize([
    node.name,
    node.filePath,
    node.summary,
    (node.tags || []).join(' '),
    node.layer,
  ].join(' '));
  if (haystack.length === 0) return 0;
  const hay = new Set(haystack);
  let score = 0;
  for (const token of queryTokens) {
    if (hay.has(token)) score += 4;
    if (haystack.some((part) => part.includes(token))) score += 1;
  }
  return score / Math.max(queryTokens.length, 1);
}

function searchGraph(graph, query, options = {}) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const limit = Number(options.limit || 12);
  return graph.nodes
    .map((node) => ({ node, score: scoreNode(node, tokens) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || String(a.node.filePath || a.node.name).localeCompare(String(b.node.filePath || b.node.name)))
    .slice(0, limit);
}

function expandOneHop(graph, nodeIds) {
  const ids = new Set(nodeIds);
  for (const edge of graph.edges || []) {
    if (ids.has(edge.source)) ids.add(edge.target);
    if (ids.has(edge.target)) ids.add(edge.source);
  }
  return ids;
}

function buildContext(graph, query, options = {}) {
  const results = searchGraph(graph, query, options);
  const matchedIds = results.map((result) => result.node.id);
  const expandedIds = expandOneHop(graph, matchedIds);
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodes = [...expandedIds].map((id) => nodeMap.get(id)).filter(Boolean);
  const edges = (graph.edges || []).filter((edge) => expandedIds.has(edge.source) && expandedIds.has(edge.target));
  const layers = (graph.layers || []).filter((layer) => layer.nodeIds.some((id) => expandedIds.has(id)));
  return { query, results, nodes, edges, layers };
}

function formatContext(context) {
  const lines = [];
  lines.push(`# CodexMap Context: ${context.query}`);
  lines.push('');
  if (context.nodes.length === 0) {
    lines.push('No matching nodes found in the project knowledge graph.');
    return lines.join('\n');
  }
  lines.push('## Relevant Nodes');
  context.nodes.slice(0, 20).forEach((node) => {
    lines.push(`- ${node.name} (${node.type}) - ${node.filePath || node.id}: ${node.summary || ''}`);
  });
  if (context.layers.length > 0) {
    lines.push('');
    lines.push('## Relevant Layers');
    context.layers.forEach((layer) => lines.push(`- ${layer.name}: ${layer.description}`));
  }
  if (context.edges.length > 0) {
    lines.push('');
    lines.push('## Nearby Relationships');
    context.edges.slice(0, 20).forEach((edge) => lines.push(`- ${edge.source} --[${edge.type}]--> ${edge.target}`));
  }
  return lines.join('\n');
}

function getChangedFiles(projectRoot, graph) {
  const base = graph.project?.gitCommitHash;
  const args = base ? ['diff', `${base}..HEAD`, '--name-only'] : ['diff', '--name-only'];
  const result = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function buildDiffContext(projectRoot, graph, changedFiles = null) {
  const changed = (changedFiles || getChangedFiles(projectRoot, graph)).map(normalizeRel);
  const changedSet = new Set(changed);
  const changedNodeIds = new Set();
  const fileNodes = graph.nodes.filter((node) => node.filePath && changedSet.has(normalizeRel(node.filePath)));
  fileNodes.forEach((node) => changedNodeIds.add(node.id));

  for (const edge of graph.edges || []) {
    if (edge.type === 'contains' && changedNodeIds.has(edge.source)) changedNodeIds.add(edge.target);
  }

  const affectedIds = expandOneHop(graph, [...changedNodeIds]);
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const changedNodes = [...changedNodeIds].map((id) => nodeMap.get(id)).filter(Boolean);
  const affectedNodes = [...affectedIds].filter((id) => !changedNodeIds.has(id)).map((id) => nodeMap.get(id)).filter(Boolean);
  const impactedEdges = (graph.edges || []).filter((edge) => affectedIds.has(edge.source) && affectedIds.has(edge.target));

  return {
    projectName: graph.project?.name || 'project',
    changedFiles: changed,
    changedNodes,
    affectedNodes,
    impactedEdges,
    affectedLayers: (graph.layers || []).filter((layer) => layer.nodeIds.some((id) => affectedIds.has(id))),
  };
}

function formatDiffReport(context) {
  const lines = [];
  lines.push(`# Diff Impact: ${context.projectName}`);
  lines.push('');
  if (context.changedFiles.length === 0) {
    lines.push('No changed files detected relative to the indexed commit.');
    return lines.join('\n');
  }
  lines.push('## Changed Files');
  context.changedFiles.forEach((file) => lines.push(`- ${file}`));
  lines.push('');
  lines.push('## Mapped Changed Nodes');
  if (context.changedNodes.length === 0) lines.push('- No changed files were mapped into the graph. Re-run `codexmap index` if files were added.');
  context.changedNodes.slice(0, 30).forEach((node) => lines.push(`- ${node.name} (${node.type}) - ${node.filePath || node.id}`));
  lines.push('');
  lines.push('## Affected Neighbors');
  if (context.affectedNodes.length === 0) lines.push('- No one-hop neighbors detected.');
  context.affectedNodes.slice(0, 30).forEach((node) => lines.push(`- ${node.name} (${node.type}) - ${node.filePath || node.id}`));
  lines.push('');
  lines.push('## Risk Hints');
  const layerCount = new Set(context.affectedLayers.map((layer) => layer.id)).size;
  if (layerCount > 1) lines.push(`- Cross-layer impact: ${layerCount} layers touched.`);
  if (context.impactedEdges.length > 10) lines.push(`- Wide blast radius: ${context.impactedEdges.length} graph relationships involved.`);
  if (layerCount <= 1 && context.impactedEdges.length <= 10) lines.push('- Localized impact based on the current graph.');
  return lines.join('\n');
}

function formatProjectIndex(graph) {
  const lines = [];
  lines.push(`# ${graph.project.name} Project Index`);
  lines.push('');
  lines.push(graph.project.description || 'CodexMap project knowledge graph.');
  lines.push('');
  lines.push(`- Files indexed: ${graph.meta.fileCount}`);
  lines.push(`- Nodes: ${graph.nodes.length}`);
  lines.push(`- Edges: ${graph.edges.length}`);
  lines.push(`- Languages: ${(graph.project.languages || []).join(', ') || 'unknown'}`);
  lines.push(`- Frameworks: ${(graph.project.frameworks || []).join(', ') || 'none detected'}`);
  lines.push('');
  lines.push('## Layers');
  (graph.layers || []).forEach((layer) => {
    lines.push(`- ${layer.name}: ${layer.nodeIds.length} nodes. ${layer.description}`);
  });
  lines.push('');
  lines.push('## Important Files');
  graph.nodes
    .filter((node) => ['file', 'config', 'document'].includes(node.type))
    .slice(0, 40)
    .forEach((node) => lines.push(`- ${node.filePath}: ${node.summary}`));
  return lines.join('\n');
}

function formatOnboardingGuide(graph) {
  const lines = [];
  lines.push(`# Learning Guide: ${graph.project.name}`);
  lines.push('');
  lines.push('This guide is generated locally by `codexmap index` from the project knowledge graph.');
  lines.push('');
  lines.push('## Suggested Tour');
  if (!graph.tour || graph.tour.length === 0) {
    lines.push('- Start with the README and primary entry points.');
  } else {
    graph.tour.forEach((step) => {
      lines.push(`- ${step.order}. ${step.title}: ${step.description}`);
      step.nodeIds.slice(0, 5).forEach((nodeId) => {
        const node = graph.nodes.find((candidate) => candidate.id === nodeId);
        if (node) lines.push(`  - ${node.filePath || node.name}`);
      });
    });
  }
  lines.push('');
  lines.push('## How To Use This With CodexMap');
  lines.push('- Run `codexmap ask <topic>` to locate relevant files and relationships.');
  lines.push('- Run `codexmap context <task>` before a coding prompt to generate scoped context.');
  lines.push('- Run `codexmap diff` after changes to see likely blast radius.');
  lines.push('- Run `codexmap run <prompt>` when you want live drift scoring and re-anchor workflows.');
  return lines.join('\n');
}

module.exports = {
  GRAPH_VERSION,
  graphPath,
  projectIndexPath,
  learnPath,
  buildProjectGraph,
  indexProject,
  loadProjectGraph,
  searchGraph,
  buildContext,
  formatContext,
  buildDiffContext,
  formatDiffReport,
  formatProjectIndex,
  formatOnboardingGuide,
};
