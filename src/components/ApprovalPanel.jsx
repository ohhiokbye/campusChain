import { useState } from 'react';
import SpotlightCard from './reactbits/SpotlightCard.jsx';
import { Check, X, ClipboardCheck } from 'lucide-react';
import {
  effectiveStatus,
  formatDateTime,
  formatTime,
  STATUS,
} from '../lib/booking.js';

export default function ApprovalPanel({ campus, now }) {
  const [councilSigner, setCouncilSigner] = useState(0);
  const requests = campus.data.bookings
    .filter((booking) => effectiveStatus(booking, now) === STATUS.Pending)
    .sort((a, b) => a.approvalDeadline - b.approvalDeadline || a.id - b.id);
  const disabled =
    Boolean(campus.pending) || !campus.online || !campus.localSigningAllowed;
  return (
    <SpotlightCard
      className="panel approval-panel"
      aria-labelledby="approval-heading"
    >
      <div className="panel-heading">
        <span className="section-number">
          <ClipboardCheck size={21} />
        </span>
        <div>
          <h2 id="approval-heading">Council approval queue</h2>
          <p>
            2-of-3 institutional council votes required to approve or reject.
          </p>
        </div>
      </div>
      <div className="council-selector" style={{ marginBottom: '1rem' }}>
        <label className="field">
          <span>Active Council Signer</span>
          <select
            value={councilSigner}
            onChange={(e) => setCouncilSigner(Number(e.target.value))}
            disabled={disabled}
          >
            <option value={0}>Council #1: Faculty Dean (Acc #0)</option>
            <option value={51}>Council #2: Student President (Acc #51)</option>
            <option value={52}>Council #3: Estate Manager (Acc #52)</option>
          </select>
        </label>
      </div>
      {requests.length === 0 ? (
        <div className="empty-schedule">
          <ClipboardCheck size={30} strokeWidth={1.4} />
          <h3>No requests awaiting approval.</h3>
          <p>New club requests will appear here.</p>
        </div>
      ) : (
        <div className="approval-rows">
          {requests.map((booking) => (
            <article
              className="approval-row"
              key={booking.id}
              aria-label={`Request ${booking.id}`}
            >
              <div className="approval-details">
                <div className="booking-top">
                  <h3>{campus.data.auditoriums[booking.auditoriumId - 1]}</h3>
                  <span className="booking-status pending">
                    Pending (2-of-3)
                  </span>
                </div>
                <p className="booking-club">
                  {campus.data.clubs[booking.clubId - 1]}
                </p>
                <p>
                  {formatDateTime(booking.startTime)} –{' '}
                  {formatTime(booking.endTime)}
                </p>
                <p className="booking-deadline">
                  Approve before {formatDateTime(booking.approvalDeadline)}
                </p>
              </div>
              <div className="decision-buttons">
                <button
                  type="button"
                  className="approve-button"
                  disabled={disabled}
                  aria-label={`Approve request ${booking.id}`}
                  onClick={() =>
                    campus.transact(councilSigner, 'approveBooking', [
                      booking.id,
                    ])
                  }
                >
                  <Check size={16} /> Vote Approve
                </button>
                <button
                  type="button"
                  className="reject-button"
                  disabled={disabled}
                  aria-label={`Reject request ${booking.id}`}
                  onClick={() =>
                    campus.transact(councilSigner, 'rejectBooking', [
                      booking.id,
                    ])
                  }
                >
                  <X size={16} /> Vote Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="schedule-note">
        Requires approvals from 2 distinct council members before the deadline.
      </p>
    </SpotlightCard>
  );
}
