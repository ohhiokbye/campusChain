import SpotlightCard from './reactbits/SpotlightCard.jsx';
import { CalendarDays, LoaderCircle } from 'lucide-react';
import {
  bookingStatus,
  effectiveStatus,
  formatDateTime,
  STATUS,
  formatTime,
  overlaps,
  toTimestamp,
} from '../lib/booking.js';

export default function BookingList({
  campus,
  clubId,
  auditoriumId,
  date,
  now,
}) {
  const start = toTimestamp(date, '00:00');
  const end = start + 86400;
  const bookings = campus.data.bookings
    .filter(
      (booking) =>
        booking.auditoriumId === auditoriumId &&
        overlaps(start, end, booking.startTime, booking.endTime),
    )
    .sort((a, b) => a.startTime - b.startTime || a.id - b.id);
  const name = campus.data.auditoriums[auditoriumId - 1];
  const day = Number.isFinite(start)
    ? new Date(start * 1000).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Select a date';

  return (
    <SpotlightCard
      className="panel schedule-panel"
      aria-labelledby="schedule-heading"
    >
      <div className="panel-heading">
        <span className="section-number">02</span>
        <div>
          <h2 id="schedule-heading">Bookings for this auditorium</h2>
          <p>Check the schedule before you reserve.</p>
        </div>
      </div>
      <div className="schedule-title">
        <div>
          <span className="eyebrow">SELECTED AUDITORIUM</span>
          <h3>{name}</h3>
        </div>
        <CalendarDays size={27} strokeWidth={1.4} />
      </div>
      <p className="schedule-date">
        {day} <span>IST</span>
      </p>
      {!bookings.length ? (
        <div className="empty-schedule">
          <span>
            <CalendarDays size={30} strokeWidth={1.4} />
          </span>
          <h3>
            {Number.isFinite(start)
              ? 'The day is yours to plan.'
              : 'Choose a date to see bookings.'}
          </h3>
          <p>
            {Number.isFinite(start)
              ? 'No bookings for this auditorium on this date.'
              : 'The schedule will appear here.'}
          </p>
        </div>
      ) : (
        <div className="booking-rows">
          {bookings.map((booking) => {
            const status = bookingStatus(booking, now);
            const canCancel =
              [STATUS.Pending, STATUS.Approved].includes(
                effectiveStatus(booking, now),
              ) &&
              booking.startTime > now &&
              booking.clubId === clubId;
            return (
              <article
                className={`booking-row ${['Cancelled', 'Rejected', 'Expired'].includes(status) ? 'is-inactive' : ''}`}
                key={booking.id}
              >
                <div className="booking-top">
                  <strong>
                    {formatTime(booking.startTime)} <span>—</span>{' '}
                    {formatTime(booking.endTime)}
                  </strong>
                  <span
                    className={`booking-status ${status.toLowerCase().replace(' ', '-')}`}
                  >
                    {status}
                  </span>
                </div>
                <p className="booking-club">
                  {campus.data.clubs[booking.clubId - 1]}
                </p>
                {status === 'Pending' && (
                  <p className="booking-deadline">
                    Approve before {formatDateTime(booking.approvalDeadline)}
                  </p>
                )}
                {canCancel && booking.status === STATUS.Approved && (
                  <p className="booking-deadline">
                    {booking.startTime - now < 86400
                      ? 'Late cancellation reduces reliability by 5. '
                      : ''}
                    {campus.data.grants.some(
                      (g) => g.bookingId === booking.id && g.state === 2,
                    )
                      ? 'Cancellation releases the unpaid 70%; the preparation advance remains yours.'
                      : ''}
                  </p>
                )}
                {canCancel && (
                  <button
                    type="button"
                    className="cancel-button"
                    disabled={
                      Boolean(campus.pending) ||
                      !campus.online ||
                      !campus.localSigningAllowed
                    }
                    onClick={() =>
                      campus.transact(clubId, 'cancelBooking', [booking.id])
                    }
                  >
                    {campus.pending === 'Cancellation' ? (
                      <>
                        <LoaderCircle size={12} className="spin" /> Confirming…
                      </>
                    ) : (
                      'Cancel booking'
                    )}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className="schedule-note">
        <span />
        <p>
          Pending holds a slot. Approval confirms it.
          <br />
          Expired, rejected, and cancelled requests release their slots.
        </p>
      </div>
    </SpotlightCard>
  );
}
