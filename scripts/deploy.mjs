import { ContractFactory, JsonRpcProvider } from 'ethers';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileContract } from './compile.mjs';
import { CLUB_NAMES, AUDITORIUM_NAMES } from '../src/data/campus.js';

export async function deployDemo(
  rpcUrl = 'http://127.0.0.1:8545',
  deploymentPath = 'public/deployment.json',
) {
  const provider = new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 100;
  try {
    if ((await provider.getNetwork()).chainId !== 31337n)
      throw new Error('Use local Ethereum chain 31337 for this course demo.');
    const addresses = await provider.send('eth_accounts', []);
    if (addresses.length < CLUB_NAMES.length + 3)
      throw new Error(
        'Restart the Hardhat node with the updated 53-account configuration.',
      );
    const artifact = await compileContract();
    const deployer = await provider.getSigner(0);
    const council = [addresses[0], addresses[51], addresses[52]];
    const contract = await new ContractFactory(
      artifact.abi,
      artifact.bytecode,
      deployer,
    ).deploy(
      CLUB_NAMES,
      addresses.slice(1, CLUB_NAMES.length + 1),
      AUDITORIUM_NAMES,
      council,
    );
    await contract.waitForDeployment();
    const deployment = {
      address: await contract.getAddress(),
      chainId: 31337,
      rpcUrl,
      demo: true,
      abi: artifact.abi,
      council,
      reputationAddress: await contract.reputation(),
      treasuryAddress: await contract.treasury(),
      reputationAbi: artifact.reputationAbi,
      treasuryAbi: artifact.treasuryAbi,
    };
    await mkdir(dirname(deploymentPath), { recursive: true });
    await writeFile(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log(
      `CampusBooking deployed: ${deployment.address}\nLoaded ${CLUB_NAMES.length} club names and ${AUDITORIUM_NAMES.length} auditoriums. Configuration: ${deploymentPath}`,
    );
    return deployment;
  } finally {
    provider.destroy();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  deployDemo().catch((error) => {
    console.error(error.shortMessage ?? error.message);
    process.exitCode = 1;
  });
}
