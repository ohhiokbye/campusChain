// Course-only workload, inspired by BLOCKBENCH's layered evaluation approach.
// Run only with user approval. Uses a separate in-process chain, never the demo RPC.
import { network } from 'hardhat';
import { BrowserProvider, ContractFactory } from 'ethers';
import { performance } from 'node:perf_hooks';
import { compileContract } from './compile.mjs';
import { CLUB_NAMES, AUDITORIUM_NAMES } from '../src/data/campus.js';

const HISTORY_SIZES = [0, 10, 50, 100];
const SAMPLE_COUNT = 5;
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
let connection, provider;

try {
  const artifact = await compileContract();
  connection = await network.create({ network: 'default' });
  if (connection.networkConfig.type !== 'edr-simulated')
    throw new Error(
      'The course benchmark requires an isolated simulated network.',
    );
  provider = new BrowserProvider(connection.provider, undefined, {
    cacheTimeout: -1,
  });
  provider.pollingInterval = 10;
  const addresses = await provider.send('eth_accounts', []);
  const coordinator = await provider.getSigner(0);
  const club = await provider.getSigner(1);
  const factory = new ContractFactory(
    artifact.abi,
    artifact.bytecode,
    coordinator,
  );
  const rows = [];
  for (const historySize of HISTORY_SIZES) {
    const contract = await factory.deploy(
      CLUB_NAMES,
      addresses.slice(1, 51),
      AUDITORIUM_NAMES,
    );
    await contract.waitForDeployment();
    // Retained expired requests avoid violating the two-active-booking limit.
    for (let index = 0; index < historySize; index++) {
      const seedStart = (await provider.getBlock('latest')).timestamp + 60;
      await (
        await contract
          .connect(club)
          .requestBooking(1, seedStart, seedStart + 3600)
      ).wait();
      await provider.send('evm_setNextBlockTimestamp', [seedStart]);
      await provider.send('evm_mine', []);
    }
    const start = (await provider.getBlock('latest')).timestamp + 3600;
    const end = start + 3600;
    let snapshot = await provider.send('evm_snapshot', []);
    const reads = [],
      requests = [],
      gas = [];
    try {
      // Each sample starts with exactly the same booking history.
      for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
        await provider.send('evm_revert', [snapshot]);
        snapshot = await provider.send('evm_snapshot', []);
        let began = performance.now();
        await contract.isAvailable(1, start, end);
        reads.push(performance.now() - began);
        began = performance.now();
        const receipt = await (
          await contract.connect(club).requestBooking(1, start, end)
        ).wait();
        requests.push(performance.now() - began);
        gas.push(Number(receipt.gasUsed));
      }
    } finally {
      await provider.send('evm_revert', [snapshot]);
    }
    rows.push({
      priorBookings: historySize,
      samples: SAMPLE_COUNT,
      availabilityMedianMs: Number(median(reads).toFixed(3)),
      requestToReceiptMedianMs: Number(median(requests).toFixed(3)),
      requestMedianGas: median(gas),
    });
  }
  // Machine-readable output can be saved for the course report without inventing results.
  console.log(
    JSON.stringify(
      {
        scope:
          'Single-process simulated EVM microbenchmark; no distributed consensus measurement',
        node: process.version,
        compiler: artifact.compiler,
        optimizerRuns: 200,
        evmVersion: 'cancun',
        workload:
          'One club, one auditorium, expired Pending history, one-hour probe',
        rows,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error.shortMessage ?? error.message);
  process.exitCode = 1;
} finally {
  provider?.destroy();
  await connection?.close();
}
