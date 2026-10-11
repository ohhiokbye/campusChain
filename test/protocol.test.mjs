import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { network } from 'hardhat';
import { BrowserProvider, Contract, ContractFactory, parseEther } from 'ethers';
import solc from 'solc';
import { compileContract } from '../scripts/compile.mjs';
import { CLUB_NAMES, AUDITORIUM_NAMES } from '../src/data/campus.js';

describe(
  'Campus protocol accounting and outcomes',
  { concurrency: false },
  () => {
    let connection,
      provider,
      artifact,
      faculty,
      club,
      other,
      councilB,
      councilC,
      council,
      booking,
      treasury,
      reputation,
      wallets,
      start,
      end,
      snapshot;
    before(async () => {
      artifact = await compileContract();
      connection = await network.create({ network: 'default' });
      provider = new BrowserProvider(connection.provider, undefined, {
        cacheTimeout: -1,
      });
      provider.pollingInterval = 10;
      [faculty, club, other, councilB, councilC] = await Promise.all(
        [0, 1, 2, 51, 52].map((i) => provider.getSigner(i)),
      );
      council = [
        await faculty.getAddress(),
        await councilB.getAddress(),
        await councilC.getAddress(),
      ];
      wallets = (await provider.send('eth_accounts', [])).slice(1, 51);
      snapshot = await provider.send('evm_snapshot', []);
    });
    after(async () => {
      provider?.destroy();
      await connection?.close();
    });
    beforeEach(async () => {
      await provider.send('evm_revert', [snapshot]);
      snapshot = await provider.send('evm_snapshot', []);
      booking = await new ContractFactory(
        artifact.abi,
        artifact.bytecode,
        faculty,
      ).deploy(CLUB_NAMES, wallets, AUDITORIUM_NAMES, council);
      await booking.waitForDeployment();
      treasury = new Contract(
        await booking.treasury(),
        artifact.treasuryAbi,
        faculty,
      );
      reputation = new Contract(
        await booking.reputation(),
        artifact.reputationAbi,
        faculty,
      );
      start = (await provider.getBlock('latest')).timestamp + 3 * 86400;
      end = start + 3600;
    });
    const tx = async (promise) => (await promise).wait();
    async function at(time) {
      await provider.send('evm_setNextBlockTimestamp', [Number(time)]);
      await provider.send('evm_mine', []);
    }
    async function rejects(promise, name, contract = booking) {
      await assert.rejects(promise, (error) => {
        const data =
          error.data ??
          error.info?.error?.data?.data ??
          error.info?.error?.data;
        const decoded =
          typeof data === 'string'
            ? contract.interface.parseError(data)
            : error.revert;
        assert.equal(decoded?.name, name, error.shortMessage ?? error.message);
        return true;
      });
    }
    async function approved() {
      await tx(booking.connect(club).requestBooking(1, start, end));
      await tx(booking.connect(faculty).approveBooking(1));
      await tx(booking.connect(councilB).approveBooking(1));
    }
    async function funded(amount = parseEther('0.5')) {
      await approved();
      await tx(treasury.donate({ value: parseEther('1') }));
      await tx(
        treasury.connect(club).requestGrant(1, amount, 'Event materials'),
      );
      await tx(treasury.connect(faculty).approveGrant(1));
      await tx(treasury.connect(councilB).approveGrant(1));
    }
    async function invariant() {
      assert.equal(
        await provider.getBalance(treasury.target),
        (await treasury.available()) +
          (await treasury.reserved()) +
          (await treasury.liabilities()),
      );
    }
    it('bounds active reservations and frees quota on expiry, with duration and horizon guards', async () => {
      await tx(booking.connect(club).requestBooking(1, start, end));
      await tx(booking.connect(club).requestBooking(2, start, end));
      await rejects(
        booking.connect(club).requestBooking(3, start, end),
        'BookingLimit',
      );
      await at((await booking.getBooking(2)).approvalDeadline);
      assert.equal(await booking.activeBookings(1), 0n);
      await tx(booking.connect(club).requestBooking(3, start, end));
      await rejects(
        booking.connect(other).requestBooking(4, start, start + 8 * 3600 + 1),
        'DurationLimit',
      );
      const far = (await provider.getBlock('latest')).timestamp + 15 * 86400;
      await rejects(
        booking.connect(other).requestBooking(4, far, far + 3600),
        'BookingWindow',
      );
    });
    it('reserves the full grant and pays both milestones exactly once', async () => {
      await funded();
      assert.equal(await treasury.available(), parseEther('0.5'));
      assert.equal(await treasury.reserved(), parseEther('0.35'));
      assert.equal(await treasury.credits(wallets[0]), parseEther('0.15'));
      await invariant();
      await tx(treasury.connect(club).withdraw());
      await rejects(
        treasury.connect(club).withdraw(),
        'NothingToWithdraw',
        treasury,
      );
      await at(end);
      await tx(booking.connect(club).claimEventCompleted(1));
      await at(end + 48 * 3600);
      await tx(booking.finalizeCompletion(1));
      assert.equal((await booking.getBooking(1)).status, 5n);
      assert.equal(await reputation.score(1), 55n);
      assert.equal(await treasury.credits(wallets[0]), parseEther('0.35'));
      assert.equal(await treasury.reserved(), 0n);
      await rejects(booking.finalizeCompletion(1), 'NotInChallengePeriod');
      await tx(treasury.connect(club).withdraw());
      await invariant();
    });
    it('releases unpaid funds on cancellation but preserves the advance', async () => {
      await funded();
      await tx(booking.connect(club).cancelBooking(1));
      assert.equal(await treasury.available(), parseEther('0.85'));
      assert.equal(await treasury.credits(wallets[0]), parseEther('0.15'));
      assert.equal(await reputation.score(1), 50n);
      assert.equal((await treasury.getGrant(1)).state, 5n);
      await invariant();
    });
    it('applies a late cancellation penalty only to approved bookings', async () => {
      await approved();
      await at(start - 24 * 3600);
      // The cancellation transaction executes after the exact 24-hour boundary.
      await tx(booking.connect(club).cancelBooking(1));
      assert.equal(await reputation.score(1), 45n);
      await tx(booking.connect(club).requestBooking(2, start, end));
      await tx(booking.connect(club).cancelBooking(2));
      assert.equal(await reputation.score(1), 45n);
    });
    it('keeps score unchanged when cancellation executes exactly 24 hours before start', async () => {
      await approved();
      await provider.send('evm_setNextBlockTimestamp', [start - 86400]);
      await tx(booking.connect(club).cancelBooking(1, { gasLimit: 500000 }));
      assert.equal(await reputation.score(1), 50n);
    });
    it('requires council resolution for a challenged no-show and returns the remaining grant', async () => {
      await funded();
      await at(end);
      await tx(booking.connect(club).claimEventCompleted(1));
      await tx(booking.connect(other).challengeEvent(1));
      await rejects(
        booking.connect(club).resolveDispute(1, false),
        'NotCouncilMember',
      );
      await tx(booking.connect(faculty).resolveDispute(1, false));
      assert.equal((await booking.getBooking(1)).status, 9n);
      await tx(booking.connect(councilB).resolveDispute(1, false));
      assert.equal((await booking.getBooking(1)).status, 6n);
      assert.equal(await reputation.score(1), 35n);
      assert.equal(await treasury.available(), parseEther('0.85'));
      await invariant();
    });
    it('closes unverified at the seven-day boundary without a reputation penalty', async () => {
      await funded();
      await rejects(
        booking.connect(other).closeUnverified(1),
        'VerificationUnavailable',
      );
      await at(end + 7 * 86400);
      await rejects(
        booking.connect(club).claimEventCompleted(1),
        'VerificationUnavailable',
      );
      await tx(booking.connect(other).closeUnverified(1));
      assert.equal((await booking.getBooking(1)).status, 7n);
      assert.equal(await reputation.score(1), 50n);
      assert.equal(await treasury.available(), parseEther('0.85'));
      await rejects(booking.closeUnverified(1), 'VerificationUnavailable');
      await invariant();
    });
    it('rejects unauthorized mutations, invalid grants, duplicates and overcommitment', async () => {
      await approved();
      await rejects(reputation.record(1, 1, 5), 'Unauthorized', reputation);
      await rejects(treasury.settle(1, true), 'Unauthorized', treasury);
      await rejects(
        treasury.connect(other).requestGrant(1, 100, 'Materials'),
        'Unauthorized',
        treasury,
      );
      await rejects(
        treasury.connect(club).requestGrant(1, 9, 'Materials'),
        'InvalidGrant',
        treasury,
      );
      await rejects(
        treasury.connect(club).requestGrant(1, 100, 'a'.repeat(281)),
        'InvalidGrant',
        treasury,
      );
      await tx(treasury.connect(club).requestGrant(1, 100, 'Materials'));
      await rejects(
        treasury.connect(club).requestGrant(1, 100, 'Materials'),
        'GrantExists',
        treasury,
      );
      await rejects(
        treasury.connect(club).approveGrant(1),
        'Unauthorized',
        treasury,
      );
      await rejects(
        treasury.connect(faculty).approveGrant(1),
        'InsufficientFunds',
        treasury,
      );
      await tx(treasury.donate({ value: 150 }));
      await tx(treasury.connect(faculty).approveGrant(1));
      await tx(treasury.connect(councilB).approveGrant(1));
      await tx(booking.connect(other).requestBooking(2, start, end));
      await tx(booking.connect(faculty).approveBooking(2));
      await tx(booking.connect(councilB).approveBooking(2));
      await tx(treasury.connect(other).requestGrant(2, 100, 'Materials'));
      await rejects(
        treasury.connect(faculty).approveGrant(2),
        'InsufficientFunds',
        treasury,
      );
      await invariant();
    });
    it('expires unapproved grants at event start and rejects duplicate decisions', async () => {
      await approved();
      await tx(treasury.connect(club).requestGrant(1, 100, 'Materials'));
      await at(start);
      assert.equal((await treasury.getGrant(1)).state, 6n);
      await rejects(
        treasury.connect(faculty).approveGrant(1),
        'GrantNotPending',
        treasury,
      );
      await rejects(
        treasury.connect(faculty).rejectGrant(1),
        'GrantNotPending',
        treasury,
      );
      await invariant();
    });
    it('keeps rounding dust in the final milestone', async () => {
      await funded(11n);
      assert.equal(await treasury.credits(wallets[0]), 3n);
      assert.equal(await treasury.reserved(), 8n);
      await at(end);
      await tx(booking.connect(club).claimEventCompleted(1));
      await at(end + 48 * 3600);
      await tx(booking.finalizeCompletion(1));
      assert.equal(await treasury.credits(wallets[0]), 11n);
      await invariant();
    });
    it('clamps repeated attested outcomes to the score bounds', async () => {
      for (let i = 0; i < 17; i++) {
        const time = (await provider.getBlock('latest')).timestamp + 60;
        await tx(booking.connect(club).requestBooking(1, time, time + 60));
        await tx(booking.connect(faculty).approveBooking(i + 1));
        await tx(booking.connect(councilB).approveBooking(i + 1));
        await at(time + 60);
        await tx(booking.connect(club).claimEventCompleted(i + 1));
        if (i < 10) {
          await at(time + 60 + 48 * 3600);
          await tx(booking.finalizeCompletion(i + 1));
        } else {
          await tx(booking.connect(other).challengeEvent(i + 1));
          await tx(booking.connect(faculty).resolveDispute(i + 1, false));
          await tx(booking.connect(councilB).resolveDispute(i + 1, false));
        }
        if (i === 9) assert.equal(await reputation.score(1), 100n);
      }
      assert.equal(await reputation.score(1), 0n);
    });
    it('retains credit after a failed transfer and prevents reentrant withdrawals', async () => {
      const source = `pragma solidity ^0.8.30;
      interface B { function requestBooking(uint256,uint256,uint256) external; }
      interface T { function requestGrant(uint256,uint256,string calldata) external; function withdraw() external; }
      contract Receiver {
        address target; bool reject; bool nested; bool public reentered;
        function book(address b,uint256 start,uint256 end) external { B(b).requestBooking(1,start,end); }
        function grant(address t) external { target=t; T(t).requestGrant(1,100,"Materials"); }
        function take(bool fail,bool attack) external { reject=fail; nested=attack; T(target).withdraw(); }
        receive() external payable { require(!reject); if(nested) { (bool ok,)=target.call(abi.encodeWithSignature("withdraw()")); reentered=ok; } }
      }`;
      const output = JSON.parse(
        solc.compile(
          JSON.stringify({
            language: 'Solidity',
            sources: { 'Receiver.sol': { content: source } },
            settings: {
              evmVersion: 'cancun',
              outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
            },
          }),
        ),
      );
      const a = output.contracts['Receiver.sol'].Receiver;
      const receiver = await new ContractFactory(
        a.abi,
        '0x' + a.evm.bytecode.object,
        faculty,
      ).deploy();
      await receiver.waitForDeployment();
      const custom = await new ContractFactory(
        artifact.abi,
        artifact.bytecode,
        faculty,
      ).deploy(['Receiver'], [receiver.target], ['MG'], council);
      await custom.waitForDeployment();
      const funds = new Contract(
        await custom.treasury(),
        artifact.treasuryAbi,
        faculty,
      );
      await tx(receiver.book(custom.target, start, end));
      await tx(custom.connect(faculty).approveBooking(1));
      await tx(custom.connect(councilB).approveBooking(1));
      await tx(funds.donate({ value: 100 }));
      await tx(receiver.grant(funds.target));
      await tx(funds.connect(faculty).approveGrant(1));
      await tx(funds.connect(councilB).approveGrant(1));
      await assert.rejects(receiver.take(true, false));
      assert.equal(await funds.credits(receiver.target), 30n);
      await tx(receiver.take(false, true));
      assert.equal(await receiver.reentered(), false);
      assert.equal(await funds.credits(receiver.target), 0n);
      assert.equal(await provider.getBalance(receiver.target), 30n);
      assert.equal(await funds.reserved(), 70n);
    });
  },
);
