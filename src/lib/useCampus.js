import { useCallback, useEffect, useRef, useState } from 'react';
import { Contract, JsonRpcProvider } from 'ethers';
import { readableError } from './booking.js';

const empty = {
  clubs: [],
  auditoriums: [],
  bookings: [],
  chainTime: 0,
  coordinator: null,
  scores: [],
  grants: [],
  credits: [],
  available: 0n,
  reserved: 0n,
  liabilities: 0n,
};

export function useCampus() {
  const [runtime, setRuntime] = useState(null);
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState('');
  const mounted = useRef(true);
  const busy = useRef(false);
  const requestNumber = useRef(0);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let provider;
    (async () => {
      try {
        const response = await fetch(
          import.meta.env.VITE_CAMPUS_DEPLOYMENT_URL ?? '/deployment.json',
          { cache: 'no-store' },
        );
        if (
          !response.ok ||
          !response.headers.get('content-type')?.includes('json')
        )
          throw new Error('Start the local demo with npm run dev.');
        const config = await response.json();
        if (!config.treasuryAddress || !config.reputationAddress)
          throw new Error(
            'Deploy the updated protocol with npm run deploy, then reload this page.',
          );
        if (cancelled) return;
        provider = new JsonRpcProvider(config.rpcUrl, undefined, {
          cacheTimeout: -1,
        });
        provider.pollingInterval = 100;
        setRuntime({
          config,
          provider,
          contract: new Contract(config.address, config.abi, provider),
          treasury: new Contract(
            config.treasuryAddress,
            config.treasuryAbi,
            provider,
          ),
          reputation: new Contract(
            config.reputationAddress,
            config.reputationAbi,
            provider,
          ),
        });
      } catch (failure) {
        if (!cancelled) {
          setError(failure.message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      provider?.destroy();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!runtime) return;
    const request = ++requestNumber.current;
    try {
      const { config, provider, contract, treasury, reputation } = runtime;
      if ((await provider.getNetwork()).chainId !== BigInt(config.chainId))
        throw new Error('The local chain does not match the deployment.');
      const block = Number(await provider.send('eth_blockNumber', []));
      if ((await provider.getCode(config.address, block)) === '0x')
        throw new Error('The contract is missing. Restart npm run dev.');
      const at = { blockTag: block };
      const [clubs, auditoriums, count, blockData, council] = await Promise.all(
        [
          contract.getClubNames(at),
          contract.getAuditoriumNames(at),
          contract.bookingCount(at),
          provider.getBlock(block),
          contract.getCouncil(at),
        ],
      );
      const rows = await Promise.all(
        Array.from({ length: Number(count) }, (_, index) =>
          contract.getBooking(index + 1, at),
        ),
      );
      const [scores, grants, credits, available, reserved, liabilities] =
        await Promise.all([
          Promise.all(clubs.map((_, i) => reputation.score(i + 1, at))),
          Promise.all(rows.map((row) => treasury.getGrant(row.id, at))),
          Promise.all(
            clubs.map(async (_, i) =>
              treasury.credits(await contract.clubWallets(i + 1, at), at),
            ),
          ),
          treasury.available(at),
          treasury.reserved(at),
          treasury.liabilities(at),
        ]);
      const bookings = rows.map((row) => ({
        id: Number(row.id),
        auditoriumId: Number(row.auditoriumId),
        clubId: Number(row.clubId),
        startTime: Number(row.startTime),
        endTime: Number(row.endTime),
        status: Number(row.status),
        approvalDeadline: Number(row.approvalDeadline),
        challengeDeadline: Number(row.challengeDeadline),
      }));
      if (mounted.current && request === requestNumber.current) {
        setData({
          clubs: [...clubs],
          auditoriums: [...auditoriums],
          bookings,
          chainTime: blockData.timestamp,
          council: Array.from(council),
          coordinator: council[0],
          scores: scores.map(Number),
          grants: grants
            .filter((g) => Number(g.state) !== 0)
            .map((g) => ({
              bookingId: Number(g.bookingId),
              club: g.club,
              amount: g.amount,
              remaining: g.remaining,
              purpose: g.purpose,
              state: Number(g.state),
            })),
          credits,
          available,
          reserved,
          liabilities,
        });
        setOnline(true);
        setError('');
      }
    } catch (failure) {
      if (mounted.current && request === requestNumber.current) {
        setOnline(false);
        setError(
          'Cannot reach the booking contract. Start or restart npm run dev.',
        );
      }
    } finally {
      if (mounted.current && request === requestNumber.current)
        setLoading(false);
    }
  }, [runtime]);

  useEffect(() => {
    if (!runtime) return;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      await refresh();
      inFlight = false;
    };
    tick();
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [runtime, refresh]);

  const localSigningAllowed = Boolean(
    runtime?.config.demo &&
    runtime.config.chainId === 31337 &&
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname),
  );

  async function transact(clubId, method, args) {
    if (busy.current) return false;
    const isCouncilMethod = [
      'approveBooking',
      'rejectBooking',
      'approveGrant',
      'rejectGrant',
      'resolveDispute',
    ].includes(method);
    const isCouncilAccount = [0, 51, 52].includes(clubId);
    const allowed = isCouncilMethod
      ? isCouncilAccount
      : (['donate', 'closeUnverified', 'finalizeCompletion'].includes(method) &&
          isCouncilAccount) ||
        ([
          'requestBooking',
          'cancelBooking',
          'requestGrant',
          'withdraw',
          'donate',
          'closeUnverified',
          'claimEventCompleted',
          'challengeEvent',
          'finalizeCompletion',
        ].includes(method) &&
          clubId >= 1 &&
          clubId <= data.clubs.length);
    if (
      !online ||
      !localSigningAllowed ||
      !Number.isInteger(clubId) ||
      !allowed
    ) {
      setNotice({
        type: 'error',
        text: 'Use a valid local demo account on localhost.',
      });
      return false;
    }
    busy.current = true;
    const label = {
      requestBooking: 'Request',
      cancelBooking: 'Cancellation',
      approveBooking: 'Approval vote',
      rejectBooking: 'Rejection vote',
      claimEventCompleted: 'Completion claim',
      challengeEvent: 'Event challenge',
      finalizeCompletion: 'Completion finalization',
      resolveDispute: 'Dispute resolution',
      closeUnverified: 'Unverified closure',
      requestGrant: 'Grant request',
      approveGrant: 'Grant approval vote',
      rejectGrant: 'Grant rejection vote',
      donate: 'Donation',
      withdraw: 'Withdrawal',
    }[method];
    setPending(label);
    setNotice({ type: 'info', text: `${label} is being confirmed…` });
    try {
      const { provider, contract } = runtime;
      if ((await provider.getNetwork()).chainId !== 31337n)
        throw new Error('Use the local course blockchain.');
      const signer = await provider.getSigner(clubId);
      const address = await signer.getAddress();
      if (
        isCouncilAccount
          ? !(await contract.isCouncilMember(address))
          : (await contract.clubIds(address)) !== BigInt(clubId)
      )
        throw new Error(
          'The account does not match this deployment. Restart the demo.',
        );
      const target = [
        'requestGrant',
        'approveGrant',
        'rejectGrant',
        'donate',
        'withdraw',
      ].includes(method)
        ? runtime.treasury
        : contract;
      const transaction = await target.connect(signer)[method](...args);
      const receipt = await transaction.wait();
      if (receipt.status !== 1)
        throw new Error('The blockchain rejected this transaction.');
      await refresh();
      setNotice({
        type: 'success',
        text: `${label} confirmed on the blockchain.`,
        hash: receipt.hash,
        record: {
          blockNumber: receipt.blockNumber,
          sender: receipt.from,
          gasUsed: receipt.gasUsed.toString(),
        },
      });
      return true;
    } catch (failure) {
      setNotice({
        type: 'error',
        text: readableError(
          failure,
          [
            'requestGrant',
            'approveGrant',
            'rejectGrant',
            'donate',
            'withdraw',
          ].includes(method)
            ? runtime.treasury.interface
            : runtime.contract.interface,
        ),
      });
      await refresh();
      return false;
    } finally {
      busy.current = false;
      setPending('');
    }
  }

  return {
    data,
    loading,
    online,
    error,
    notice,
    pending,
    localSigningAllowed,
    refresh,
    transact,
  };
}
