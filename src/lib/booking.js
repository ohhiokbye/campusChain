export function overlaps(start, end, existingStart, existingEnd) {
  return start < existingEnd && end > existingStart;
}

// Campus times stay in IST, regardless of the viewer's device timezone.
export function toTimestamp(date, time) {
  return Math.floor(new Date(`${date}T${time}:00+05:30`).getTime() / 1000);
}
export function campusDate(date = new Date()) {
  return new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 10);
}
export function initialSlot() {
  return {
    date: campusDate(new Date(Date.now() + 86400000)),
    start: '10:00',
    end: '11:00',
  };
}
export function formatTime(timestamp) {
  return new Date(timestamp * 1000).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}
export const STATUS = Object.freeze({
  Pending: 0,
  Approved: 1,
  Rejected: 2,
  Cancelled: 3,
  Expired: 4,
  Completed: 5,
  NoShow: 6,
  Unverified: 7,
  Claimed: 8,
  Disputed: 9,
});
export function effectiveStatus(booking, now) {
  return booking.status === STATUS.Pending && now >= booking.approvalDeadline
    ? STATUS.Expired
    : booking.status;
}
export function blocksSlot(booking, now) {
  const status = effectiveStatus(booking, now);
  return status === STATUS.Pending || status === STATUS.Approved;
}
export function bookingStatus(booking, now) {
  const status = effectiveStatus(booking, now);
  if (status === STATUS.Approved) {
    if (booking.endTime <= now) return 'Awaiting verification';
    if (booking.startTime <= now) return 'In progress';
  }
  if (status === STATUS.Claimed) {
    if (booking.challengeDeadline && now < booking.challengeDeadline)
      return 'In challenge period';
    return 'Ready to finalize';
  }
  if (status === STATUS.Disputed) return 'Disputed';
  if (status === STATUS.NoShow) return 'No-show';
  return Object.keys(STATUS).find((name) => STATUS[name] === status);
}
export function formatDateTime(timestamp) {
  return (
    new Date(timestamp * 1000).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' IST'
  );
}

const errorMessages = {
  BookingLimit: 'Your club already holds two upcoming or ongoing reservations.',
  BookingWindow: 'Bookings can start at most 14 days in advance.',
  DurationLimit: 'An event can last at most eight hours.',
  VerificationUnavailable:
    'This event is not eligible for that verification action.',
  InvalidGrant:
    'Use an approved future booking, at least 10 wei, and a purpose of 1–280 UTF-8 bytes.',
  GrantExists: 'Only one grant request is allowed per booking.',
  GrantNotPending: 'This grant is no longer awaiting a decision.',
  InsufficientFunds: 'The treasury cannot reserve the full requested grant.',
  NothingToWithdraw: 'There are no funds available for you to withdraw.',
  Unauthorized: 'This account cannot perform that action.',
  TransferFailed:
    'The receiving account rejected the payment. Your credit is retained.',
  ClubNotRegistered:
    'This blockchain account does not belong to a listed club.',
  AuditoriumNotFound: 'Select one of the listed auditoriums.',
  InvalidTimeRange: 'End time must be after start time.',
  StartNotInFuture: 'Choose a start time in the future.',
  BookingConflict:
    'This slot is held by a pending request or approved booking. Choose a different time or auditorium.',
  BookingNotFound: 'This booking does not exist.',
  NotBookingOwner:
    'Only the club that made this booking can cancel or claim it.',
  NotCoordinator: 'Only the coordinator can approve, reject, or verify events.',
  NotCouncilMember: 'Only designated council members can perform this action.',
  AlreadyVoted: 'This council member has already cast a vote.',
  NotInChallengePeriod: 'This booking is not currently in a challenge period.',
  ChallengePeriodActive: 'The 48-hour challenge period has not elapsed yet.',
  ChallengePeriodEnded:
    'The challenge period for this claim has already passed.',
  NotDisputed: 'This event is not currently under dispute.',
  BookingNotPending: 'This request has already been decided or cancelled.',
  BookingNotActive: 'Only pending or approved bookings can be cancelled.',
  ApprovalExpired:
    'The approval deadline has passed. This request has expired.',
  BookingAlreadyStarted: 'A booking cannot be cancelled after its start time.',
};
export function readableError(error, contractInterface) {
  const data =
    error.data ?? error.info?.error?.data?.data ?? error.info?.error?.data;
  let name = error.revert?.name;
  if (typeof data === 'string' && contractInterface) {
    try {
      name = contractInterface.parseError(data)?.name ?? name;
    } catch {
      /* RPC error */
    }
  }
  return (
    errorMessages[name] ??
    error.shortMessage ??
    error.message ??
    'The transaction failed. Please try again.'
  );
}
