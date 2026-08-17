function parseArgs(argv) {
  const args = [...argv];
  const command = args[0] && !args[0].startsWith('-') ? args.shift() : 'run';
  const flags = {};
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = args[i + 1];

    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
    } else if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }

  return { command, flags, positionals };
}

function booleanFlag(flags, positiveKey, negativeKey, defaultValue) {
  if (flags[negativeKey] === true) return false;
  if (flags[positiveKey] === true) return true;
  return defaultValue;
}

module.exports = {
  parseArgs,
  booleanFlag,
};
