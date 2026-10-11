import solc from 'solc';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function compileContract() {
  const sources = Object.fromEntries(
    await Promise.all(
      ['CampusBooking', 'CampusReputation', 'CampusTreasury'].map(
        async (name) => [
          `${name}.sol`,
          {
            content: await readFile(
              new URL(`../contracts/${name}.sol`, import.meta.url),
              'utf8',
            ),
          },
        ],
      ),
    ),
  );
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: 'Solidity',
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: 'cancun',
          outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
        },
      }),
    ),
  );
  const errors = (output.errors ?? []).filter(
    (item) => item.severity === 'error',
  );
  if (errors.length)
    throw new Error(errors.map((item) => item.formattedMessage).join('\n'));
  const contract = output.contracts['CampusBooking.sol'].CampusBooking;
  return {
    contractName: 'CampusBooking',
    reputationAbi:
      output.contracts['CampusReputation.sol'].CampusReputation.abi,
    treasuryAbi: output.contracts['CampusTreasury.sol'].CampusTreasury.abi,
    compiler: solc.version(),
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const artifact = await compileContract();
  await mkdir('artifacts', { recursive: true });
  await writeFile(
    'artifacts/CampusBooking.json',
    JSON.stringify(artifact, null, 2),
  );
  console.log(`Compiled CampusBooking with solc ${artifact.compiler}`);
}
