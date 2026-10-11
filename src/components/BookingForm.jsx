import SpotlightCard from './reactbits/SpotlightCard.jsx';
import { ArrowRight, CheckCircle2, Clock3, LoaderCircle } from 'lucide-react';
import { campusDate } from '../lib/booking.js';

export default function BookingForm({
  campus,
  clubId,
  setClubId,
  auditoriumId,
  setAuditoriumId,
  slot,
  setSlot,
  activeReservations,
  valid,
  available,
  onSubmit,
}) {
  const disabled = Boolean(campus.pending) || !campus.online;
  const updateSlot = (key, value) =>
    setSlot((current) => ({ ...current, [key]: value }));
  return (
    <SpotlightCard
      className="panel booking-panel"
      aria-labelledby="booking-heading"
    >
      <div className="panel-heading">
        <span className="section-number">01</span>
        <div>
          <h2 id="booking-heading">Request an auditorium</h2>
          <p>Choose a slot. Get coordinator approval.</p>
        </div>
      </div>
      <form onSubmit={onSubmit}>
        <fieldset disabled={disabled}>
          <label className="field club-field">
            <span>Your club</span>
            <select
              aria-label="Your club"
              required
              value={clubId}
              onChange={(event) => setClubId(event.target.value)}
            >
              <option value="">Select your club</option>
              {campus.data.clubs.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {clubId && (
            <p className="reputation-note">
              Reliability{' '}
              <strong>
                {campus.data.scores[Number(clubId) - 1] ?? 50}/100
              </strong>{' '}
              · {activeReservations}/2 reservations held. Equal booking access
              for every club.
            </p>
          )}
          <fieldset className="auditorium-field">
            <legend>Choose an auditorium</legend>
            <div className="auditorium-options">
              {campus.data.auditoriums.map((name, index) => (
                <label
                  className={`auditorium-option ${auditoriumId === index + 1 ? 'selected' : ''}`}
                  key={name}
                >
                  <input
                    type="radio"
                    name="auditorium"
                    value={index + 1}
                    checked={auditoriumId === index + 1}
                    onChange={() => setAuditoriumId(index + 1)}
                  />
                  <span>{name}</span>
                  <i>
                    {auditoriumId === index + 1 && <CheckCircle2 size={16} />}
                  </i>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>Date</span>
            <input
              aria-label="Booking date"
              type="date"
              min={campusDate(new Date(campus.data.chainTime * 1000))}
              max={campusDate(
                new Date((campus.data.chainTime + 14 * 86400) * 1000),
              )}
              required
              value={slot.date}
              onChange={(event) => updateSlot('date', event.target.value)}
            />
          </label>
          <div className="time-fields">
            <label className="field">
              <span>From</span>
              <input
                aria-label="Start time"
                type="time"
                required
                value={slot.start}
                onChange={(event) => updateSlot('start', event.target.value)}
              />
            </label>
            <label className="field">
              <span>Until</span>
              <input
                aria-label="End time"
                type="time"
                required
                value={slot.end}
                onChange={(event) => updateSlot('end', event.target.value)}
              />
            </label>
          </div>
        </fieldset>
        <div
          className={`availability ${available && campus.online ? 'free' : 'busy'}`}
          aria-live="polite"
        >
          {available && campus.online ? (
            <CheckCircle2 size={18} />
          ) : (
            <Clock3 size={18} />
          )}
          <div>
            <strong>
              {!campus.online
                ? 'Connect to the local blockchain'
                : !valid
                  ? 'Choose a valid future time slot'
                  : available
                    ? 'This time slot is available'
                    : 'This time slot is already reserved'}
            </strong>
            <small>
              {!valid
                ? 'Choose a future start within 14 days and a duration of up to eight hours.'
                : 'The contract checks availability again when you request.'}
            </small>
          </div>
        </div>
        <button
          className="book-button"
          disabled={
            disabled ||
            !available ||
            !clubId ||
            activeReservations >= 2 ||
            !campus.localSigningAllowed
          }
        >
          {campus.pending === 'Request' ? (
            <>
              <LoaderCircle size={18} className="spin" /> Confirming request…
            </>
          ) : (
            <>
              Request auditorium <ArrowRight size={18} />
            </>
          )}
        </button>
        <p className="form-note">
          Maximum two upcoming or ongoing reservations per club; up to eight
          hours each and 14 days ahead. Uses your club’s local demo account.
          Pending requests hold the slot for up to 48 hours, or until its start
          time. Coordinator approval is required.
        </p>
      </form>
    </SpotlightCard>
  );
}
