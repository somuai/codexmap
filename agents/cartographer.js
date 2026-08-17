// TODO: implement per SKILL.md
const chokidar = require('chokidar');
const parser = require('@babel/parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SHARED_DIR = path.resolve(process.env.CODEXMAP_SHARED_DIR || path.join(ROOT_DIR, 'shared'));
const OUTPUT_DIR = path.resolve(process.env.CODEXMAP_OUTPUT_DIR || path.join(ROOT_DIR, 'output'));
const MAP_STATE_PATH = path.join(SHARED_DIR, 'map-state.json');
const DEBOUNCE_MS = 300;
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

const pendingTimers = new Map();

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(SHARED_DIR, { recursive: true });

function ensureJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback), 'utf8');
  }
}

function atomicWriteJson(filePath, value) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function normalizeOutputPath(filePath) {
  return toPosix(path.relative(OUTPUT_DIR, filePath));
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function getLanguage(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mapping = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.json': 'json',
    '.md': 'markdown',
    '.html': 'html',
    '.css': 'css',
    '.sh': 'shell'
  };

  return mapping[extension] || extension.replace('.', '') || 'text';
}

function createNode(overrides) {
  return {
    id: overrides.id,
    label: overrides.label,
    type: overrides.type,
    path: overrides.path,
    language: overrides.language,
    summary: overrides.summary || '',
    code: overrides.code || '',
    score: overrides.score ?? null,
    grade: overrides.grade || 'pending',
    contentHash: overrides.contentHash,
    cyclomaticComplexity: overrides.cyclomaticComplexity ?? null,
    children: overrides.children || [],
    lastUpdated: overrides.lastUpdated || new Date().toISOString()
  };
}

function parseBabelAst(filePath, source) {
  return parser.parse(source, {
    sourceType: 'unambiguous',
    errorRecovery: true,
    plugins: [
      'jsx',
      'typescript',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'decorators-legacy',
      'dynamicImport',
      'objectRestSpread',
      'optionalChaining',
      'topLevelAwait'
    ]
  });
}

function walkAst(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      walkAst(entry, visitor, parent);
    }
    return;
  }

  if (typeof node.type === 'string') {
    visitor(node, parent);
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') {
      continue;
    }
    walkAst(value, visitor, node);
  }
}

function getNodeName(node, parent) {
  if (node.type === 'FunctionDeclaration') {
    return node.id && node.id.name ? node.id.name : 'anonymous';
  }

  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    if (parent && parent.type === 'VariableDeclarator' && parent.id && parent.id.name) {
      return parent.id.name;
    }
    if (parent && parent.type === 'AssignmentExpression' && parent.left) {
      if (parent.left.type === 'Identifier') {
        return parent.left.name;
      }
      if (parent.left.type === 'MemberExpression' && parent.left.property) {
        return parent.left.property.name || parent.left.property.value || 'assignedFunction';
      }
    }
    if (parent && parent.type === 'ObjectProperty' && parent.key) {
      return parent.key.name || parent.key.value || 'objectProperty';
    }
  }

  if (
    node.type === 'ClassMethod' ||
    node.type === 'ObjectMethod' ||
    node.type === 'ClassPrivateMethod'
  ) {
    return node.key && (node.key.name || node.key.value) ? node.key.name || node.key.value : 'method';
  }

  return null;
}

function countCyclomaticComplexity(ast) {
  let complexity = 1;

  walkAst(ast, (node) => {
    switch (node.type) {
      case 'IfStatement':
        complexity += 1;
        if (node.alternate) {
          complexity += 1;
        }
        break;
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement':
        complexity += 1;
        break;
      case 'SwitchStatement':
        complexity += Math.max(node.cases ? node.cases.length : 0, 1);
        break;
      default:
        break;
    }
  });

  return complexity;
}

function resolveImportTarget(absoluteFilePath, importSource) {
  if (!importSource || !importSource.startsWith('.')) {
    return null;
  }

  const candidateBase = path.resolve(path.dirname(absoluteFilePath), importSource);
  const extension = path.extname(candidateBase);
  const attempts = extension
    ? [candidateBase]
    : [
        candidateBase,
        `${candidateBase}.js`,
        `${candidateBase}.jsx`,
        `${candidateBase}.ts`,
        `${candidateBase}.tsx`,
        path.join(candidateBase, 'index.js'),
        path.join(candidateBase, 'index.jsx'),
        path.join(candidateBase, 'index.ts'),
        path.join(candidateBase, 'index.tsx')
      ];

  for (const attempt of attempts) {
    if (fs.existsSync(attempt)) {
      return normalizeOutputPath(attempt);
    }
  }

  if (candidateBase.startsWith(OUTPUT_DIR)) {
    return normalizeOutputPath(candidateBase);
  }

  return null;
}

function parseFileToNodes(filePath) {
  const absolutePath = path.resolve(filePath);
  const rawContent = fs.readFileSync(absolutePath, 'utf8');
  const relativePath = normalizeOutputPath(absolutePath);
  const now = new Date().toISOString();
  const fileHash = sha256(rawContent);
  const fileNode = createNode({
    id: relativePath,
    label: path.basename(relativePath),
    type: 'file',
    path: relativePath,
    language: getLanguage(relativePath),
    summary: '',
    code: rawContent,
    score: null,
    grade: 'pending',
    contentHash: fileHash,
    cyclomaticComplexity: null,
    children: [],
    lastUpdated: now
  });

  const nodes = [];
  const edges = [];
  const extension = path.extname(relativePath).toLowerCase();

  if (JS_EXTENSIONS.has(extension)) {
    try {
      const ast = parseBabelAst(absolutePath, rawContent);
      const seenNames = new Map();
      const functionNodes = [];

      walkAst(ast, (node, parent) => {
        const isFunctionNode =
          node.type === 'FunctionDeclaration' ||
          node.type === 'ArrowFunctionExpression' ||
          node.type === 'FunctionExpression' ||
          node.type === 'ClassMethod' ||
          node.type === 'ObjectMethod' ||
          node.type === 'ClassPrivateMethod';

        if (!isFunctionNode) {
          return;
        }

        const baseName = getNodeName(node, parent);
        if (!baseName) {
          return;
        }

        const duplicateCount = (seenNames.get(baseName) || 0) + 1;
        seenNames.set(baseName, duplicateCount);
        const stableName = duplicateCount > 1 ? `${baseName}#${duplicateCount}` : baseName;
        const id = `${relativePath}::${stableName}`;
        const functionCode = rawContent.slice(node.start || 0, node.end || 0);

        functionNodes.push(
          createNode({
            id,
            label: stableName,
            type: 'function',
            path: relativePath,
            language: getLanguage(relativePath),
            summary: '',
            code: functionCode,
            score: null,
            grade: 'pending',
            contentHash: sha256(functionCode),
            cyclomaticComplexity: null,
            children: [],
            lastUpdated: now
          })
        );
      });

      fileNode.cyclomaticComplexity = countCyclomaticComplexity(ast);
      fileNode.children = functionNodes.map((node) => node.id);
      nodes.push(fileNode, ...functionNodes);

      if (Array.isArray(ast.program && ast.program.body)) {
        for (const statement of ast.program.body) {
          if (statement.type !== 'ImportDeclaration') {
            continue;
          }
          const target = resolveImportTarget(absolutePath, statement.source && statement.source.value);
          if (target) {
            edges.push({ source: relativePath, target });
          }
        }
      }
    } catch (error) {
      fileNode.summary = rawContent.split('\n').find((line) => line.trim()) || '';
      nodes.push(fileNode);
    }
  } else {
    fileNode.summary = rawContent
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');

    const importMatches = rawContent.matchAll(/^\s*import\s+.*?from\s+['"](.+?)['"]/gm);
    for (const match of importMatches) {
      const target = resolveImportTarget(absolutePath, match[1]);
      if (target) {
        edges.push({ source: relativePath, target });
      }
    }

    nodes.push(fileNode);
  }

  return { fileId: relativePath, nodes, edges };
}

const { db, notify } = require('../lib/db');

function updateMapState(parsedFile) {
  const deleteNodes = db.prepare('DELETE FROM nodes WHERE path = ?');
  const deleteEdges = db.prepare('DELETE FROM edges WHERE source = ?');
  
  const insertNode = db.prepare(`
    INSERT OR REPLACE INTO nodes (id, label, type, path, language, summary, code, score, grade, cyclomaticComplexity, children, contentHash, lastUpdated, S1, S2, A, T, D, S_final)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const insertEdge = db.prepare(`
    INSERT OR IGNORE INTO edges (source, target)
    VALUES (?, ?)
  `);

  const selectOldNode = db.prepare('SELECT contentHash, score, grade, S1, S2, A, T, D, S_final FROM nodes WHERE id = ?');
  const oldNode = selectOldNode.get(parsedFile.fileId);
  const fileNode = parsedFile.nodes.find(n => n.id === parsedFile.fileId);
  
  let preserveScore = false;
  let oldScore = null;
  let oldGrade = 'pending';
  let oldS1 = null, oldS2 = null, oldA = null, oldT = null, oldD = null, oldSFinal = null;
  
  if (oldNode && fileNode && oldNode.contentHash === fileNode.contentHash) {
    preserveScore = true;
    oldScore = oldNode.score;
    oldGrade = oldNode.grade;
    oldS1 = oldNode.S1;
    oldS2 = oldNode.S2;
    oldA = oldNode.A;
    oldT = oldNode.T;
    oldD = oldNode.D;
    oldSFinal = oldNode.S_final;
  }

  db.exec('BEGIN TRANSACTION');
  try {
    deleteNodes.run(parsedFile.fileId);
    deleteEdges.run(parsedFile.fileId);
    
    for (const node of parsedFile.nodes) {
      let score = node.score;
      let grade = node.grade;
      let s1 = null, s2 = null, a = null, t = null, d = null, sFinal = null;
      if (node.id === parsedFile.fileId && preserveScore) {
        score = oldScore;
        grade = oldGrade;
        s1 = oldS1;
        s2 = oldS2;
        a = oldA;
        t = oldT;
        d = oldD;
        sFinal = oldSFinal;
      }
      insertNode.run(
        node.id,
        node.label,
        node.type,
        node.path,
        node.language,
        node.summary,
        node.code,
        score,
        grade,
        node.cyclomaticComplexity,
        JSON.stringify(node.children || []),
        node.contentHash,
        node.lastUpdated || new Date().toISOString(),
        s1,
        s2,
        a,
        t,
        d,
        sFinal
      );
    }
    
    for (const edge of parsedFile.edges) {
      insertEdge.run(edge.source, edge.target);
    }
    
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  notify('graph_update', { fileId: parsedFile.fileId });
}

function scheduleParse(filePath) {
  const absolutePath = path.resolve(filePath);
  if (pendingTimers.has(absolutePath)) {
    clearTimeout(pendingTimers.get(absolutePath));
  }

  pendingTimers.set(
    absolutePath,
    setTimeout(() => {
      pendingTimers.delete(absolutePath);
      try {
        const parsedFile = parseFileToNodes(absolutePath);
        updateMapState(parsedFile);
      } catch (error) {
        console.error(`[CARTOGRAPHER] Failed to parse ${absolutePath}: ${error.message}`);
      }
    }, DEBOUNCE_MS)
  );
}

const watcher = chokidar.watch(OUTPUT_DIR, {
  ignoreInitial: false,
  persistent: true
});

watcher.on('all', (event, filePath) => {
  if (!['add', 'change'].includes(event)) {
    return;
  }

  const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
  if (!stats || !stats.isFile()) {
    return;
  }

  console.log(`[CARTOGRAPHER] ${event}: ${filePath}`);
  scheduleParse(filePath);
});

process.on('SIGINT', async () => {
  await watcher.close();
  process.exit(0);
});
