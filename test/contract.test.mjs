import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { network } from 'hardhat';
import { BrowserProvider, ContractFactory, ZeroAddress } from 'ethers';
import { compileContract } from '../scripts/compile.mjs';
import { CLUB_NAMES, AUDITORIUM_NAMES } from '../src/data/campus.js';

describe('Minimal auditorium booking contract', { concurrency: false }, () => {
  let connection,
    provider,
    artifact,
    deployer,
    clubA,
    clubB,
    clubLast,
    councilB,
    councilC,
    council,
    wallets,
    contract,
    start,
    end,
    snapshot;
  before(async () => {
    artifact = await compileContract();
    connection = await network.connect();
    provider = new BrowserProvider(connection.provider, undefined, {
      cacheTimeout: -1,
    });
    provider.pollingInterval = 10;
    const all = await provider.send('eth_accounts', []);
    wallets = all.slice(1, 51);
    [deployer, clubA, clubB, clubLast, councilB, councilC] = await Promise.all(
      [0, 1, 2, 50, 51, 52].map((index) => provider.getSigner(index)),
    );
    council = [
      await deployer.getAddress(),
      await councilB.getAddress(),
      await councilC.getAddress(),
    ];
    snapshot = await connection.provider.request({ method: 'evm_snapshot' });
  });
  after(async () => {
    provider?.destroy();
    await connection?.close();
  });
  beforeEach(async () => {
    await connection.provider.request({
      method: 'evm_revert',
      params: [snapshot],
    });
    snapshot = await connection.provider.request({ method: 'evm_snapshot' });
    contract = await new ContractFactory(
      artifact.abi,
      artifact.bytecode,
      deployer,
    ).deploy(CLUB_NAMES, wallets, AUDITORIUM_NAMES, council);
    await contract.waitForDeployment();
    start = (await provider.getBlock('latest')).timestamp + 3600;
    end = start + 3600;
  });
  async function reverts(promise, expected) {
    await assert.rejects(promise, (error) => {
      const data =
        error.data ?? error.info?.error?.data?.data ?? error.info?.error?.data;
      const parsed =
        typeof data === 'string'
          ? contract.interface.parseError(data)
          : error.revert;
      assert.equal(parsed?.name, expected, error.shortMessage ?? error.message);
      return true;
    });
  }
  const book = (signer = clubA, auditorium = 1, from = start, until = end) =>
    contract.connect(signer).requestBooking(auditorium, from, until);

  it('contains exactly the supplied 50 distinct names and 8 auditoriums, without management APIs', async () => {
    assert.equal(CLUB_NAMES.length, 50);
    assert.equal(new Set(CLUB_NAMES).size, 50);
    assert.equal(CLUB_NAMES.at(-1), 'ANDROID CLUB');
    assert.deepEqual(Array.from(await contract.getClubNames()), CLUB_NAMES);
    assert.deepEqual(
      Array.from(await contract.getAuditoriumNames()),
      AUDITORIUM_NAMES,
    );
    assert.equal(await contract.clubIds(await clubA.getAddress()), 1n);
    assert.equal(await contract.clubIds(await clubLast.getAddress()), 50n);
    assert.equal(await contract.clubIds(await deployer.getAddress()), 0n);
    assert.deepEqual(Array.from(await contract.getCouncil()), council);
    const functions = artifact.abi
      .filter((item) => item.type === 'function')
      .map((item) => item.name);
    for (const removed of [
      'registerClub',
      'addResource',
      'setResourceActive',
      'administrator',
    ])
      assert.equal(functions.includes(removed), false);
  });
  it('stores a booking with its club and emits a blockchain event', async () => {
    assert.equal(await contract.isAvailable(1, start, end), true);
    const receipt = await (await book()).wait();
    const event = contract.interface.parseLog(receipt.logs[0]);
    assert.equal(event.name, 'BookingRequested');
    assert.equal(event.args.clubId, 1n);
    assert.equal(event.args.auditoriumId, 1n);
    const booking = await contract.getBooking(1);
    assert.equal(booking.startTime, BigInt(start));
    assert.equal(booking.endTime, BigInt(end));
    assert.equal(booking.status, 0n);
    assert.equal(await contract.isAvailable(1, start, end), false);
  });
  it('rejects identical, partial, contained, and enclosing overlaps', async () => {
    await (await book()).wait();
    for (const [from, until] of [
      [start, end],
      [start - 60, start + 60],
      [end - 60, end + 60],
      [start + 60, end - 60],
      [start - 60, end + 60],
    ]) {
      await reverts(book(clubB, 1, from, until), 'BookingConflict');
      assert.equal(await contract.isAvailable(1, from, until), false);
    }
    assert.equal(await contract.bookingCount(), 1n);
  });
  it('allows adjacent intervals on both sides of a reservation', async () => {
    await (await book()).wait();
    await (await book(clubB, 1, start - 600, start)).wait();
    await (await book(clubB, 1, end, end + 600)).wait();
    assert.equal(await contract.bookingCount(), 3n);
  });
  it('allows simultaneous bookings of different auditoriums', async () => {
    await (await book()).wait();
    await (await book(clubB, 2)).wait();
    assert.equal(await contract.bookingCount(), 2n);
  });
  it('rejects unregistered accounts and invalid or past intervals', async () => {
    await reverts(book(deployer), 'ClubNotRegistered');
    await reverts(book(clubA, 1, start, start), 'InvalidTimeRange');
    await reverts(book(clubA, 1, end, start), 'InvalidTimeRange');
    const block = await provider.getBlock('latest');
    await reverts(book(clubA, 1, block.timestamp, end), 'StartNotInFuture');
    await reverts(book(clubA, 1, 1, 2), 'StartNotInFuture');
    assert.equal(await contract.isAvailable(1, 1, 2), false);
    await reverts(contract.isAvailable(1, start, start), 'InvalidTimeRange');
  });
  it('only the booking club can cancel; deployment gives no cancellation privileges', async () => {
    await (await book()).wait();
    await reverts(contract.connect(clubB).cancelBooking(1), 'NotBookingOwner');
    await reverts(contract.cancelBooking(1), 'NotBookingOwner');
    const receipt = await (
      await contract.connect(clubA).cancelBooking(1)
    ).wait();
    assert.equal(
      receipt.logs
        .filter(
          (log) => log.address.toLowerCase() === contract.target.toLowerCase(),
        )
        .map((log) => contract.interface.parseLog(log).name)
        .at(-1),
      'BookingCancelled',
    );
    await reverts(contract.connect(clubA).cancelBooking(1), 'BookingNotActive');
  });
  it('cancellation releases the slot and preserves the original record', async () => {
    await (await book()).wait();
    await (await contract.connect(clubA).cancelBooking(1)).wait();
    assert.equal(await contract.isAvailable(1, start, end), true);
    await (await book(clubB)).wait();
    assert.equal((await contract.getBooking(1)).status, 3n);
    assert.equal((await contract.getBooking(1)).clubId, 1n);
    assert.equal((await contract.getBooking(2)).clubId, 2n);
    assert.equal(await contract.bookingCount(), 2n);
  });
  it('rejects cancellation of an approved booking at the exact start boundary and after completion', async () => {
    await (await book()).wait();
    await (await contract.connect(deployer).approveBooking(1)).wait();
    await (await contract.connect(councilB).approveBooking(1)).wait();
    for (const timestamp of [start, end + 1]) {
      await connection.provider.request({
        method: 'evm_setNextBlockTimestamp',
        params: [timestamp],
      });
      await connection.provider.request({ method: 'evm_mine' });
      await reverts(
        contract.connect(clubA).cancelBooking(1),
        'BookingAlreadyStarted',
      );
    }
  });
  it('rejects unknown auditorium and booking IDs', async () => {
    for (const id of [0, 9]) {
      await reverts(book(clubA, id), 'AuditoriumNotFound');
      await reverts(contract.isAvailable(id, start, end), 'AuditoriumNotFound');
    }
    await reverts(contract.getBooking(0), 'BookingNotFound');
    await reverts(contract.connect(clubA).cancelBooking(1), 'BookingNotFound');
  });
  it('allows the 50th club to book the eighth auditorium', async () => {
    await (await book(clubLast, 8)).wait();
    const booking = await contract.getBooking(1);
    assert.equal(booking.clubId, 50n);
    assert.equal(booking.auditoriumId, 8n);
  });
  it('accepts exactly one of two conflicting transactions mined in the same block', async () => {
    await connection.provider.request({
      method: 'evm_setAutomine',
      params: [false],
    });
    try {
      const first = await contract
        .connect(clubA)
        .requestBooking(1, start, end, { gasLimit: 500000 });
      const second = await contract
        .connect(clubB)
        .requestBooking(1, start, end, { gasLimit: 500000 });
      await connection.provider.request({ method: 'evm_mine' });
      const receipts = await Promise.all([
        provider.getTransactionReceipt(first.hash),
        provider.getTransactionReceipt(second.hash),
      ]);
      assert.deepEqual(
        receipts.map((receipt) => receipt.status).sort(),
        [0, 1],
      );
      assert.equal(receipts[0].blockNumber, receipts[1].blockNumber);
      assert.equal(await contract.bookingCount(), 1n);
      assert.equal(
        (await contract.getBooking(1)).clubId,
        receipts[0].status === 1 ? 1n : 2n,
      );
    } finally {
      await connection.provider.request({
        method: 'evm_setAutomine',
        params: [true],
      });
    }
  });
  it('rejects invalid initial catalog data or duplicate wallet identities', async () => {
    const factory = new ContractFactory(
      artifact.abi,
      artifact.bytecode,
      deployer,
    );
    const wallet = await clubA.getAddress();
    for (const args of [
      [[], [], ['MG']],
      [['Club'], [], ['MG']],
      [['Club'], [ZeroAddress], ['MG']],
      [['Club'], [await deployer.getAddress()], ['MG']],
      [[''], [wallet], ['MG']],
      [['Club'], [wallet], []],
      [['Club'], [wallet], ['']],
      [['Club A', 'Club B'], [wallet, wallet], ['MG']],
    ])
      await reverts(factory.deploy(...args, council), 'InvalidCatalog');
  });
  async function mineAt(timestamp) {
    await provider.send('evm_setNextBlockTimestamp', [Number(timestamp)]);
    await provider.send('evm_mine', []);
  }
  it('only council members can approve or reject a pending request, requiring 2 approvals', async () => {
    await (await book()).wait();
    for (const method of ['approveBooking', 'rejectBooking']) {
      await reverts(contract.connect(clubA)[method](1), 'NotCouncilMember');
      await reverts(contract.connect(clubB)[method](1), 'NotCouncilMember');
    }
    const receipt1 = await (
      await contract.connect(deployer).approveBooking(1)
    ).wait();
    assert.equal(
      contract.interface.parseLog(receipt1.logs[0]).name,
      'BookingVoteCast',
    );
    assert.equal((await contract.getBooking(1)).status, 0n);
    const receipt2 = await (
      await contract.connect(councilB).approveBooking(1)
    ).wait();
    assert.equal(
      contract.interface.parseLog(receipt2.logs[1]).name,
      'BookingApproved',
    );
    assert.equal((await contract.getBooking(1)).status, 1n);
    assert.equal(await contract.isAvailable(1, start, end), false);
    await reverts(book(clubB), 'BookingConflict');
  });
  it('rejection releases the interval and retains its record and event', async () => {
    await (await book()).wait();
    await (await contract.connect(deployer).rejectBooking(1)).wait();
    const receipt = await (
      await contract.connect(councilB).rejectBooking(1)
    ).wait();
    assert.equal(
      contract.interface.parseLog(receipt.logs[1]).name,
      'BookingRejected',
    );
    assert.equal((await contract.getBooking(1)).status, 2n);
    assert.equal(await contract.isAvailable(1, start, end), true);
    await (await book(clubB)).wait();
    assert.equal((await contract.getBooking(2)).clubId, 2n);
  });
  it('only the owning club can cancel an approved booking, which releases its slot', async () => {
    await (await book()).wait();
    await (await contract.connect(deployer).approveBooking(1)).wait();
    await (await contract.connect(councilB).approveBooking(1)).wait();
    await reverts(contract.cancelBooking(1), 'NotBookingOwner');
    await reverts(contract.connect(clubB).cancelBooking(1), 'NotBookingOwner');
    await (await contract.connect(clubA).cancelBooking(1)).wait();
    assert.equal((await contract.getBooking(1)).status, 3n);
    assert.equal(await contract.isAvailable(1, start, end), true);
    await (await book(clubB)).wait();
  });
  it('cannot decide an approved, rejected, or cancelled request twice', async () => {
    for (const [id, action] of [
      [1, 'approveBooking'],
      [2, 'rejectBooking'],
      [3, 'cancelBooking'],
    ]) {
      await (await book(clubA, id)).wait();
      if (action === 'cancelBooking') {
        await (await contract.connect(clubA).cancelBooking(id)).wait();
      } else {
        await (await contract.connect(deployer)[action](id)).wait();
        await (await contract.connect(councilB)[action](id)).wait();
      }
      for (const method of ['approveBooking', 'rejectBooking']) {
        await reverts(contract[method](id), 'BookingNotPending');
      }
      if (action !== 'approveBooking')
        await reverts(
          contract.connect(clubA).cancelBooking(id),
          'BookingNotActive',
        );
    }
  });
  it('rejects council decisions on unknown booking IDs', async () => {
    for (const id of [0, 1]) {
      await reverts(contract.approveBooking(id), 'BookingNotFound');
      await reverts(contract.rejectBooking(id), 'BookingNotFound');
    }
  });
  it('sets the short-notice deadline to the event start', async () => {
    const receipt = await (await book()).wait();
    const row = await contract.getBooking(1);
    assert.equal(row.approvalDeadline, BigInt(start));
    assert.equal(
      contract.interface.parseLog(receipt.logs[0]).args.approvalDeadline,
      BigInt(start),
    );
    await mineAt(start);
    assert.equal((await contract.getBooking(1)).status, 4n);
    await reverts(contract.approveBooking(1), 'ApprovalExpired');
    await reverts(contract.rejectBooking(1), 'ApprovalExpired');
    await reverts(contract.connect(clubA).cancelBooking(1), 'ApprovalExpired');
  });
  it('sets long-notice deadlines to 48 hours after the request block', async () => {
    start += 3 * 86400;
    end = start + 3600;
    const receipt = await (await book()).wait();
    const block = await provider.getBlock(receipt.blockNumber);
    assert.equal(
      (await contract.getBooking(1)).approvalDeadline,
      BigInt(block.timestamp + 48 * 3600),
    );
  });
  it('expires exactly at the 48-hour deadline and permits rebooking without cleanup', async () => {
    start += 3 * 86400;
    end = start + 3600;
    await (await book()).wait();
    const original = await contract.getBooking(1);
    await mineAt(original.approvalDeadline - 1n);
    assert.equal((await contract.getBooking(1)).status, 0n);
    assert.equal(await contract.isAvailable(1, start, end), false);
    await mineAt(original.approvalDeadline);
    assert.equal((await contract.getBooking(1)).status, 4n);
    assert.equal(await contract.bookingCount(), 1n);
    assert.equal(await contract.isAvailable(1, start, end), true);
    await reverts(contract.approveBooking(1), 'ApprovalExpired');
    await reverts(contract.rejectBooking(1), 'ApprovalExpired');
    await reverts(contract.connect(clubA).cancelBooking(1), 'ApprovalExpired');
    await (await book(clubB)).wait();
    const old = await contract.getBooking(1);
    assert.equal(old.status, 4n);
    assert.equal(old.startTime, original.startTime);
    assert.equal((await contract.getBooking(2)).status, 0n);
  });
  it('allows approval one second before the deadline and preserves approval after it', async () => {
    start += 3 * 86400;
    end = start + 3600;
    await (await book()).wait();
    const deadline = (await contract.getBooking(1)).approvalDeadline;
    await provider.send('evm_setNextBlockTimestamp', [Number(deadline - 2n)]);
    await (await contract.connect(deployer).approveBooking(1)).wait();
    await (await contract.connect(councilB).approveBooking(1)).wait();
    await mineAt(deadline);
    assert.equal((await contract.getBooking(1)).status, 1n);
    assert.equal(await contract.isAvailable(1, start, end), false);
    await reverts(book(clubB), 'BookingConflict');
  });
  it('cannot bypass expiry by submitting a transaction that executes at the deadline', async () => {
    start += 3 * 86400;
    end = start + 3600;
    await (await book()).wait();
    const deadline = (await contract.getBooking(1)).approvalDeadline;
    await provider.send('evm_setNextBlockTimestamp', [Number(deadline)]);
    await assert.rejects(async () => {
      const transaction = await contract.approveBooking(1, {
        gasLimit: 200000,
      });
      await transaction.wait();
    });
    assert.equal((await contract.getBooking(1)).status, 4n);
  });
  it('allows club to claim completion and finalize after 48-hour challenge window', async () => {
    await (await book()).wait();
    await (await contract.connect(deployer).approveBooking(1)).wait();
    await (await contract.connect(councilB).approveBooking(1)).wait();
    await mineAt(end);
    await reverts(contract.finalizeCompletion(1), 'NotInChallengePeriod');
    const claimTx = await (
      await contract.connect(clubA).claimEventCompleted(1)
    ).wait();
    assert.equal(
      contract.interface.parseLog(claimTx.logs[0]).name,
      'EventClaimed',
    );
    assert.equal((await contract.getBooking(1)).status, 8n); // Claimed
    await reverts(contract.finalizeCompletion(1), 'ChallengePeriodActive');
    await mineAt(end + 48 * 3600);
    const finalTx = await (await contract.finalizeCompletion(1)).wait();
    assert.equal(
      contract.interface.parseLog(finalTx.logs[1]).name,
      'OutcomeRecorded',
    );
    assert.equal((await contract.getBooking(1)).status, 5n); // Completed
  });
  it('allows challenging a claim and resolving via 2-of-3 council', async () => {
    await (await book()).wait();
    await (await contract.connect(deployer).approveBooking(1)).wait();
    await (await contract.connect(councilB).approveBooking(1)).wait();
    await mineAt(end);
    await (await contract.connect(clubA).claimEventCompleted(1)).wait();
    const challengeTx = await (
      await contract.connect(clubB).challengeEvent(1)
    ).wait();
    assert.equal(
      contract.interface.parseLog(challengeTx.logs[0]).name,
      'EventChallenged',
    );
    assert.equal((await contract.getBooking(1)).status, 9n); // Disputed
    await reverts(contract.finalizeCompletion(1), 'NotInChallengePeriod');
    await (await contract.connect(deployer).resolveDispute(1, false)).wait();
    assert.equal((await contract.getBooking(1)).status, 9n); // Still Disputed after 1 vote
    await (await contract.connect(councilB).resolveDispute(1, false)).wait();
    assert.equal((await contract.getBooking(1)).status, 6n); // NoShow
  });
});
