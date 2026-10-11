import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { deployDemo } from './deploy.mjs';
import { unlink } from 'node:fs/promises';

const chainPort = Number(process.env.CAMPUS_CHAIN_PORT ?? 8545);
const webPort = Number(process.env.CAMPUS_WEB_PORT ?? 5173);
const rpcUrl = `http://127.0.0.1:${chainPort}`;
const deploymentPath =
  process.env.CAMPUS_DEPLOYMENT_FILE ?? 'public/deployment.json';
const processes = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill('SIGTERM');
  if (process.env.CAMPUS_DEPLOYMENT_FILE)
    void unlink(deploymentPath).catch(() => {});
  process.exitCode = code;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

try {
  // Never attach to or reseed an unrelated chain already running at this port.
  const occupied = await fetch(rpcUrl, { signal: AbortSignal.timeout(500) })
    .then(() => true)
    .catch(() => false);
  if (occupied)
    throw new Error(
      `Port ${chainPort} is in use. Stop that node or set CAMPUS_CHAIN_PORT.`,
    );
  const chain = spawn(
    process.execPath,
    [
      'node_modules/hardhat/dist/src/cli.js',
      '--network',
      'node',
      'node',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(chainPort),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  processes.push(chain);
  let chainOutput = '';
  for (const stream of [chain.stdout, chain.stderr])
    stream.on('data', (data) => {
      chainOutput = (chainOutput + data).slice(-6000);
    });
  chain.on('close', (code) => {
    if (!stopping) {
      console.error(`Local chain stopped (${code}).\n${chainOutput}`);
      stop(1);
    }
  });
  let ready = false;
  for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
        }),
        signal: AbortSignal.timeout(500),
      });
      ready = (await response.json()).result === '0x7a69';
      if (ready) break;
    } catch {
      /* wait for local node startup */
    }
    await delay(200);
  }
  if (!ready) throw new Error(`Local chain did not start.\n${chainOutput}`);
  await deployDemo(rpcUrl, deploymentPath);
  if (!stopping) {
    const web = spawn(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        '--host',
        '127.0.0.1',
        '--port',
        String(webPort),
      ],
      { stdio: 'inherit' },
    );
    processes.push(web);
    web.on('exit', (code) => {
      if (!stopping) stop(code ?? 1);
    });
    console.log(
      `\nCampusChain: http://127.0.0.1:${webPort}\nLocal Ethereum: ${rpcUrl} (chain 31337)\nDemo accounts are available in the app. Ctrl+C stops both servers.\n`,
    );
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
