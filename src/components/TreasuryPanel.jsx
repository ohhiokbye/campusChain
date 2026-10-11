import { useState } from 'react';
import { formatEther, parseEther } from 'ethers';
import { Wallet, ArrowUpRight } from 'lucide-react';
import SpotlightCard from './reactbits/SpotlightCard.jsx';
import { formatDateTime } from '../lib/booking.js';

const grantNames = [
  'None',
  'Pending',
  'Approved',
  'Rejected',
  'Completed',
  'Released',
  'Expired',
];
const eth = (value) => formatEther(value ?? 0n);

export default function TreasuryPanel({ campus, clubId, coordinatorView }) {
  const [donation, setDonation] = useState('1');
  const [bookingId, setBookingId] = useState('');
  const [amount, setAmount] = useState('0.5');
  const [purpose, setPurpose] = useState('');
  const [inputError, setInputError] = useState('');
  const [councilSigner, setCouncilSigner] = useState(0);
  const { data, pending, online, localSigningAllowed, transact } = campus;
  const actor = coordinatorView ? 0 : clubId;
  const disabled =
    Boolean(pending) ||
    !online ||
    !localSigningAllowed ||
    (!coordinatorView && !clubId);
  const eligible = data.bookings.filter(
    (b) =>
      b.clubId === clubId &&
      b.status === 1 &&
      b.startTime > data.chainTime &&
      !data.grants.some((g) => g.bookingId === b.id),
  );
  const selected = eligible.some((b) => String(b.id) === bookingId)
    ? bookingId
    : String(eligible[0]?.id ?? '');
  const grants = data.grants;

  async function submit(event, donate) {
    event.preventDefault();
    setInputError('');
    try {
      const value = parseEther(donate ? donation : amount);
      if (
        value <= 0n ||
        (!donate &&
          (value < 10n ||
            !selected ||
            new TextEncoder().encode(purpose).length > 280 ||
            !purpose.trim()))
      )
        throw new Error(
          'Enter a valid amount and a short purpose (up to 280 UTF-8 bytes).',
        );
      const ok = await transact(
        actor,
        donate ? 'donate' : 'requestGrant',
        donate ? [{ value }] : [Number(selected), value, purpose.trim()],
      );
      if (ok && !donate) setPurpose('');
    } catch (failure) {
      setInputError(failure.message);
    }
  }

  return (
    <section
      className="treasury-content"
      id="campus-treasury"
      aria-label="Treasury funds and grants"
    >
      <div className="treasury-layout">
        <SpotlightCard className="panel treasury-panel">
          <div className="panel-heading">
            <span className="section-number">
              <Wallet size={21} />
            </span>
            <div>
              <h2>Campus treasury</h2>
              <p>Every allocation leaves a record.</p>
            </div>
          </div>
          <div className="treasury-metrics">
            <div>
              <span>Available</span>
              <strong>
                {eth(data.available)} <small>ETH</small>
              </strong>
            </div>
            <div>
              <span>Reserved for events</span>
              <strong>
                {eth(data.reserved)} <small>ETH</small>
              </strong>
            </div>
            <div>
              <span>Awaiting withdrawal</span>
              <strong>
                {eth(data.liabilities)} <small>ETH</small>
              </strong>
            </div>
          </div>
          <form
            onSubmit={(event) => submit(event, true)}
            className="compact-form"
          >
            <label className="field">
              <span>Donation · test ETH</span>
              <input
                type="text"
                inputMode="decimal"
                required
                value={donation}
                onChange={(e) => setDonation(e.target.value)}
                disabled={disabled}
              />
            </label>
            <button className="approve-button" disabled={disabled}>
              Donate <ArrowUpRight size={16} />
            </button>
          </form>
          <p className="form-note">
            Uses{' '}
            {coordinatorView ? 'the coordinator’s' : 'your selected club’s'}{' '}
            local demo account. Donations are public and do not guarantee a
            grant.
          </p>
          {!coordinatorView && (
            <div className="withdraw-row">
              <span>
                Your withdrawal credit{' '}
                <strong>{eth(data.credits[clubId - 1])} ETH</strong>
              </span>
              <button
                className="approve-button"
                disabled={disabled || !(data.credits[clubId - 1] > 0n)}
                onClick={() => transact(actor, 'withdraw', [])}
              >
                Withdraw
              </button>
            </div>
          )}
          {inputError && (
            <p className="message error" role="alert">
              {inputError}
            </p>
          )}
          {!coordinatorView && (
            <form
              onSubmit={(event) => submit(event, false)}
              className="grant-form"
            >
              <h3>Request event funding</h3>
              <p className="form-note">
                30% is a preparation advance. The remaining 70% requires
                verified completion. The advance is not recovered if the event
                fails.
              </p>
              <fieldset disabled={disabled || !eligible.length}>
                <label className="field">
                  <span>Approved booking</span>
                  <select
                    value={selected}
                    onChange={(e) => setBookingId(e.target.value)}
                    required
                  >
                    {!eligible.length && (
                      <option value="">No eligible bookings</option>
                    )}
                    {eligible.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.id} · {data.auditoriums[b.auditoriumId - 1]} ·{' '}
                        {formatDateTime(b.startTime)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Requested test ETH</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Purpose</span>
                  <textarea
                    rows={2}
                    maxLength={280}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    required
                    placeholder="Equipment and materials for our event"
                  />
                </label>
                <button className="book-button">
                  Request grant <ArrowUpRight size={16} />
                </button>
              </fieldset>
            </form>
          )}
        </SpotlightCard>

        <SpotlightCard className="panel grants-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PUBLIC FUNDING REGISTER</p>
              <h2>Booking-linked grants</h2>
              <p>
                Approval reserves the full amount. Only completion unlocks the
                final milestone.
              </p>
            </div>
          </div>
          {!grants.length && (
            <p className="protocol-empty">Grant requests will appear here.</p>
          )}
          {grants.map((g) => {
            const b = data.bookings.find((item) => item.id === g.bookingId);
            return (
              <article className="grant-row" key={g.bookingId}>
                <div>
                  <div className="booking-top">
                    <h3>
                      Booking #{g.bookingId} · {data.clubs[b.clubId - 1]}
                    </h3>
                    <span className="booking-status">
                      {grantNames[g.state]}
                    </span>
                  </div>
                  <p>{g.purpose}</p>
                  <p className="booking-deadline">
                    {eth(g.amount)} ETH requested · {eth(g.remaining)} ETH
                    reserved
                  </p>
                  {g.state === 5 && (
                    <p className="form-note">
                      Unpaid 70% released to the treasury. The preparation
                      advance remains credited.
                    </p>
                  )}
                </div>
                {coordinatorView && g.state === 1 && (
                  <div className="decision-buttons">
                    <div
                      className="council-selector"
                      style={{ width: '100%', marginBottom: '0.5rem' }}
                    >
                      <select
                        value={councilSigner}
                        onChange={(e) =>
                          setCouncilSigner(Number(e.target.value))
                        }
                        disabled={disabled}
                      >
                        <option value={0}>
                          Council #1: Faculty Dean (Acc #0)
                        </option>
                        <option value={51}>
                          Council #2: Student President (Acc #51)
                        </option>
                        <option value={52}>
                          Council #3: Estate Manager (Acc #52)
                        </option>
                      </select>
                    </div>
                    <button
                      className="approve-button"
                      disabled={disabled || g.amount > data.available}
                      onClick={() =>
                        transact(councilSigner, 'approveGrant', [g.bookingId])
                      }
                    >
                      Approve grant
                    </button>
                    <button
                      className="reject-button"
                      disabled={disabled}
                      onClick={() =>
                        transact(councilSigner, 'rejectGrant', [g.bookingId])
                      }
                    >
                      Reject grant
                    </button>
                    {g.amount > data.available && (
                      <small>Insufficient available funds</small>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </SpotlightCard>
      </div>
    </section>
  );
}
