const REQUIRED_METHODS = ['detect', 'health', 'start', 'reanchor'];

function validateEngineAdapter(name, adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error(`Engine adapter "${name}" must export an object`);
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof adapter[method] !== 'function') {
      throw new Error(`Engine adapter "${name}" is missing ${method}()`);
    }
  }

  return adapter;
}

module.exports = {
  REQUIRED_METHODS,
  validateEngineAdapter,
};
