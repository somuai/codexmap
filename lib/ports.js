const net = require('net');

function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findFreePort(startPort, host = '127.0.0.1', maxAttempts = 80) {
  let port = Number(startPort);
  if (!Number.isInteger(port) || port <= 0) port = 3333;

  for (let offset = 0; offset < maxAttempts; offset += 1) {
    const candidate = port + offset;
    if (await isPortFree(candidate, host)) return candidate;
  }

  throw new Error(`No free port found from ${port} after ${maxAttempts} attempts`);
}

module.exports = {
  isPortFree,
  findFreePort,
};
