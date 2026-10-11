import { defineConfig } from 'hardhat/config';

const local = {
  type: 'edr-simulated',
  chainType: 'l1',
  chainId: 31337,
  accounts: { count: 53 },
};

export default defineConfig({
  networks: {
    // In-process contract tests keep deterministic, transaction-only mining.
    default: local,
    // Empty blocks advance deadlines even when nobody sends a transaction.
    node: { ...local, mining: { auto: true, interval: 5000 } },
  },
});
