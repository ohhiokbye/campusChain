import { it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS,
  blocksSlot,
  bookingStatus,
  effectiveStatus,
  campusDate,
  overlaps,
  readableError,
  toTimestamp,
} from '../src/lib/booking.js';

it('converts campus inputs to the intended IST instant', () => {
  assert.equal(
    toTimestamp('2026-10-07', '10:00'),
    Date.UTC(2026, 9, 7, 4, 30) / 1000,
  );
  assert.equal(campusDate(new Date('2026-10-06T20:00:00Z')), '2026-10-07');
});
it('matches half-open interval boundaries', () => {
  assert.equal(overlaps(100, 200, 200, 300), false);
  assert.equal(overlaps(100, 201, 200, 300), true);
});
it('pending holds a slot only strictly before its deadline', () => {
  const row = {
    status: STATUS.Pending,
    approvalDeadline: 100,
    startTime: 200,
    endTime: 300,
  };
  assert.equal(effectiveStatus(row, 99), STATUS.Pending);
  assert.equal(blocksSlot(row, 99), true);
  assert.equal(bookingStatus(row, 100), 'Expired');
  assert.equal(blocksSlot(row, 100), false);
});
it('approved bookings persist past the approval deadline and display their event lifecycle', () => {
  const row = {
    status: STATUS.Approved,
    approvalDeadline: 100,
    startTime: 200,
    endTime: 300,
  };
  assert.equal(bookingStatus(row, 199), 'Approved');
  assert.equal(bookingStatus(row, 200), 'In progress');
  assert.equal(bookingStatus(row, 300), 'Awaiting verification');
  assert.equal(blocksSlot(row, 199), true);
});
it('inactive states never hold a slot', () => {
  for (const status of [STATUS.Rejected, STATUS.Cancelled, STATUS.Expired]) {
    const row = { status, approvalDeadline: 100, startTime: 200, endTime: 300 };
    assert.equal(blocksSlot(row, 99), false);
    assert.equal(
      bookingStatus(row, 99),
      Object.keys(STATUS).find((key) => STATUS[key] === status),
    );
  }
});
it('translates authorization and expiry failures into useful messages', () => {
  assert.match(
    readableError({ revert: { name: 'NotCoordinator' } }),
    /Only the coordinator/,
  );
  assert.match(
    readableError({ revert: { name: 'ApprovalExpired' } }),
    /deadline has passed/,
  );
  assert.match(
    readableError({ revert: { name: 'BookingConflict' } }),
    /pending request or approved booking/,
  );
  assert.equal(readableError({ message: 'Offline' }), 'Offline');
});
