import { BadgeCheck } from 'lucide-react';
import SpotlightCard from './reactbits/SpotlightCard.jsx';
import { formatDateTime, bookingStatus } from '../lib/booking.js';

export default function EventOutcomes({ campus, clubId, coordinatorView }) {
  const { data, pending, online, localSigningAllowed, transact } = campus;
  const actor = coordinatorView ? 0 : clubId;
  const disabled =
    Boolean(pending) ||
    !online ||
    !localSigningAllowed ||
    (!coordinatorView && !clubId);
  const outcomes = data.bookings.filter(
    (b) =>
      (b.status === 1 && b.endTime <= data.chainTime) ||
      b.status === 8 ||
      b.status === 9,
  );
  return (
    <SpotlightCard className="panel event-outcomes-panel">
      <div className="panel-heading">
        <span className="section-number">
          <BadgeCheck size={21} />
        </span>
        <div>
          <h2>Event outcomes & verification</h2>
          <p>
            Optimistic claims · 48h challenge window · 2-of-3 council dispute
            resolution.
          </p>
        </div>
      </div>
      <p className="form-note">
        After an event ends, the host club claims completion. If unchallenged
        for 48 hours, anyone can finalize it. Disputed events are resolved by a
        2-of-3 council vote.
      </p>
      {!outcomes.length && (
        <p className="protocol-empty">
          No events awaiting claim or verification.
        </p>
      )}
      {outcomes.map((b) => {
        const expired = data.chainTime >= b.endTime + 7 * 86400;
        return (
          <article className="protocol-row" key={b.id}>
            <div className="booking-top">
              <h3>
                #{b.id} · {data.auditoriums[b.auditoriumId - 1]}
              </h3>
              <span
                className={`booking-status ${b.status === 8 ? 'pending' : b.status === 9 ? 'cancelled' : ''}`}
              >
                {b.status === 8
                  ? 'In Challenge Period'
                  : b.status === 9
                    ? 'Disputed'
                    : 'Awaiting Claim'}
              </span>
            </div>
            <p>{data.clubs[b.clubId - 1]}</p>
            <p className="booking-deadline">
              Ended {formatDateTime(b.endTime)}
              {b.status === 8 &&
                ` · Challenge ends ${formatDateTime(b.challengeDeadline)}`}
            </p>
            <div className="decision-buttons">
              {expired ? (
                <button
                  className="approve-button"
                  disabled={disabled}
                  onClick={() => transact(actor, 'closeUnverified', [b.id])}
                >
                  Close as unverified
                </button>
              ) : b.status === 1 ? (
                clubId === b.clubId ? (
                  <button
                    className="approve-button"
                    disabled={disabled}
                    onClick={() =>
                      transact(clubId, 'claimEventCompleted', [b.id])
                    }
                  >
                    Claim completion
                  </button>
                ) : (
                  <span className="booking-status pending">
                    Awaiting club claim
                  </span>
                )
              ) : b.status === 8 ? (
                <>
                  <button
                    className="reject-button"
                    disabled={disabled}
                    onClick={() => transact(actor, 'challengeEvent', [b.id])}
                  >
                    Challenge event
                  </button>
                  <button
                    className="approve-button"
                    disabled={disabled}
                    onClick={() =>
                      transact(actor, 'finalizeCompletion', [b.id])
                    }
                  >
                    Finalize completion
                  </button>
                </>
              ) : b.status === 9 ? (
                coordinatorView ? (
                  <>
                    <button
                      className="approve-button"
                      disabled={disabled}
                      onClick={() =>
                        transact(0, 'resolveDispute', [b.id, true])
                      }
                    >
                      Vote Valid (+5)
                    </button>
                    <button
                      className="reject-button"
                      disabled={disabled}
                      onClick={() =>
                        transact(0, 'resolveDispute', [b.id, false])
                      }
                    >
                      Vote Fraud (-15)
                    </button>
                  </>
                ) : (
                  <span className="booking-status cancelled">
                    Under council dispute
                  </span>
                )
              ) : null}
            </div>
          </article>
        );
      })}
      <details className="outcome-history">
        <summary>Recorded outcomes</summary>
        {data.bookings
          .filter((b) => b.status >= 5 && b.status <= 7)
          .map((b) => (
            <p key={b.id}>
              #{b.id} · {data.clubs[b.clubId - 1]} ·{' '}
              {bookingStatus(b, data.chainTime)}
            </p>
          ))}
        {!data.bookings.some((b) => b.status >= 5 && b.status <= 7) && (
          <p>No outcomes recorded yet.</p>
        )}
      </details>
    </SpotlightCard>
  );
}
