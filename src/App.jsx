import { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  LoaderCircle,
  Moon,
  Sun,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { useCampus } from './lib/useCampus.js';
import {
  blocksSlot,
  initialSlot,
  overlaps,
  toTimestamp,
} from './lib/booking.js';
import TreasuryPage from './components/TreasuryPage.jsx';
import EventOutcomes from './components/EventOutcomes.jsx';
import { usePage } from './lib/usePage.js';
import BookingForm from './components/BookingForm.jsx';
import BookingList from './components/BookingList.jsx';
import ApprovalPanel from './components/ApprovalPanel.jsx';
import { useTheme } from './lib/useTheme.js';
import GradientText from './components/reactbits/GradientText.jsx';
import ShapeGrid from './components/reactbits/ShapeGrid.jsx';
import CampusScene from './components/CampusScene.jsx';
import RollingText from './components/RollingText.jsx';
import LedgerMarquee from './components/LedgerMarquee.jsx';

export default function App() {
  const campus = useCampus();
  const { page, navigate } = usePage();
  const treasuryPage = page === 'treasury';
  const [coordinatorView, setCoordinatorView] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [clubId, setClubId] = useState('');
  const [auditoriumId, setAuditoriumId] = useState(1);
  const [slot, setSlot] = useState(initialSlot);
  const start = toTimestamp(slot.date, slot.start);
  const end = toTimestamp(slot.date, slot.end);
  const now = campus.data.chainTime;
  const valid =
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start &&
    start > now &&
    start <= now + 14 * 86400 &&
    end - start <= 8 * 3600;
  const conflict = campus.data.bookings.some(
    (booking) =>
      booking.auditoriumId === auditoriumId &&
      blocksSlot(booking, now) &&
      overlaps(start, end, booking.startTime, booking.endTime),
  );
  const available = valid && !conflict;
  const activeReservations = campus.data.bookings.filter(
    (b) => b.clubId === Number(clubId) && b.endTime > now && blocksSlot(b, now),
  ).length;

  async function book(event) {
    event.preventDefault();
    if (available && clubId)
      await campus.transact(Number(clubId), 'requestBooking', [
        auditoriumId,
        start,
        end,
      ]);
  }

  return (
    <div className="site">
      <a
        className="skip-link"
        href={treasuryPage ? '#treasury-workspace' : '#booking-workspace'}
      >
        {treasuryPage ? 'Skip to treasury' : 'Skip to booking'}
      </a>
      <header className="site-header">
        <a
          className="brand"
          href="/"
          onClick={(event) => navigate(event, 'bookings')}
          aria-label="CampusChain home"
        >
          <span className="brand-icon">
            <Building2 size={23} strokeWidth={1.6} />
          </span>
          <span>
            campus<span className="brand-light">chain</span>
            <small>VIT CHENNAI</small>
          </span>
        </a>
        <nav className="header-navigation" aria-label="Workspace navigation">
          <a
            href="/"
            onClick={(event) => navigate(event, 'bookings')}
            aria-current={!treasuryPage ? 'page' : undefined}
          >
            <RollingText>Bookings</RollingText>
          </a>
          <a
            href="/treasury"
            onClick={(event) => navigate(event, 'treasury')}
            aria-current={treasuryPage ? 'page' : undefined}
          >
            <RollingText>Treasury</RollingText>
          </a>
        </nav>
        <div className="header-actions">
          <button
            type="button"
            className="view-button"
            disabled={Boolean(campus.pending)}
            onClick={() => setCoordinatorView((value) => !value)}
          >
            <RollingText>
              {coordinatorView
                ? treasuryPage
                  ? 'Club treasury'
                  : 'Club booking'
                : 'Coordinator view'}
            </RollingText>
          </button>
          <button
            type="button"
            className="theme-button"
            aria-label={
              theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
            }
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>

      <main>
        {!treasuryPage && (
          <>
            <section className="intro" aria-labelledby="intro-heading">
              <div className="hero-background" aria-hidden="true">
                <ShapeGrid
                  borderColor={
                    theme === 'dark'
                      ? 'rgba(255, 255, 255, 0.045)'
                      : 'rgba(0, 0, 0, 0.045)'
                  }
                />
                <div className="hero-glow hero-glow-lavender" />
                <div className="hero-glow hero-glow-teal" />
              </div>
              <div className="hero-layout">
                <div className="hero-content">
                  <p className="hero-badge">
                    <span /> THE CAMPUS RESOURCE PROTOCOL
                  </p>
                  <h1 id="intro-heading" data-page-title tabIndex={-1}>
                    <span className="headline-line">
                      <span>Big ideas deserve</span>
                    </span>
                    <span className="headline-line">
                      <GradientText className="hero-gradient">
                        a place to happen.
                      </GradientText>
                    </span>
                  </h1>
                  <p className="intro-copy">
                    Shared spaces. Clear approvals. Ideas in motion.{' '}
                    <br className="desktop-break" />
                    Book your next event, fund its milestones, and make it
                    official.
                  </p>
                  <div className="hero-actions">
                    <a className="hero-cta" href="#booking-workspace">
                      <RollingText>Find your space</RollingText>{' '}
                      <ArrowUpRight size={18} />
                    </a>
                    <span className="hero-process">
                      REQUEST <span>→</span> APPROVE <span>→</span> VERIFY
                    </span>
                  </div>
                  <div className="hero-meta">
                    <span
                      className={`chain-status ${campus.online ? 'connected' : ''}`}
                    >
                      <i />
                      {campus.loading
                        ? 'Connecting to blockchain'
                        : campus.online
                          ? 'Local blockchain connected'
                          : 'Blockchain offline'}
                    </span>
                    <span className="approval-hint">
                      <ShieldCheck size={15} /> Coordinator approval required
                    </span>
                  </div>
                </div>
                <CampusScene />
              </div>
              <span className="frame-corner corner-left" aria-hidden="true" />
              <span className="frame-corner corner-right" aria-hidden="true" />
            </section>
            <LedgerMarquee />
          </>
        )}
        {treasuryPage && (
          <section className="treasury-intro" aria-labelledby="treasury-title">
            <p className="eyebrow">CAMPUS TREASURY</p>
            <h1 id="treasury-title" data-page-title tabIndex={-1}>
              Funding, with a clear trail.
            </h1>
            <p>
              Support campus events, follow grant milestones, and withdraw
              approved funds.
            </p>
            <span
              className={`chain-status ${campus.online ? 'connected' : ''}`}
            >
              <i />
              {campus.loading
                ? 'Connecting to blockchain'
                : campus.online
                  ? 'Local blockchain connected'
                  : 'Blockchain offline'}
            </span>
          </section>
        )}
        <div
          className={`workspace ${treasuryPage ? 'treasury-workspace' : ''}`}
          id={treasuryPage ? 'treasury-workspace' : 'booking-workspace'}
          tabIndex={-1}
        >
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">
                {treasuryPage
                  ? coordinatorView
                    ? 'GRANT APPROVAL DESK'
                    : 'THE FUNDING DESK'
                  : coordinatorView
                    ? 'COORDINATOR WORKSPACE'
                    : 'THE BOOKING DESK'}
              </p>
              <h2>
                {treasuryPage
                  ? coordinatorView
                    ? 'Review event funding.'
                    : 'Turn a booking into an event.'
                  : coordinatorView
                    ? 'A little approval. A lot of possibilities.'
                    : 'Make room for your next event.'}
              </h2>
            </div>
            <span className="timezone-note">
              {treasuryPage ? (
                'Local test ETH only'
              ) : (
                <>
                  All times in IST <span>UTC +05:30</span>
                </>
              )}
            </span>
          </div>

          {campus.error && (
            <div className="message error" role="alert">
              <span>{campus.error}</span>
              <button type="button" onClick={campus.refresh}>
                Retry connection
              </button>
            </div>
          )}
          {campus.notice && (
            <div
              className={`message ${campus.notice.type}`}
              role={campus.notice.type === 'error' ? 'alert' : 'status'}
            >
              {campus.pending ? (
                <LoaderCircle size={19} className="spin" />
              ) : campus.notice.type === 'success' ? (
                <CheckCircle2 size={19} />
              ) : null}
              <div>
                <p>{campus.notice.text}</p>
                {campus.notice.hash && (
                  <small className="transaction" title={campus.notice.hash}>
                    Transaction: {campus.notice.hash}
                  </small>
                )}
                {campus.notice.record && (
                  <details className="transaction-record">
                    <summary>View transaction record</summary>
                    <dl>
                      <div>
                        <dt>Block</dt>
                        <dd>{campus.notice.record.blockNumber}</dd>
                      </div>
                      <div>
                        <dt>Sent by</dt>
                        <dd className="record-address">
                          {campus.notice.record.sender}
                        </dd>
                      </div>
                      <div>
                        <dt>Gas used</dt>
                        <dd>{campus.notice.record.gasUsed} gas units</dd>
                      </div>
                    </dl>
                  </details>
                )}
              </div>
            </div>
          )}

          {campus.loading ? (
            <div className="loading">
              <LoaderCircle size={24} className="spin" />
              <p>
                {treasuryPage
                  ? 'Loading the campus treasury…'
                  : 'Loading the campus booking register…'}
              </p>
            </div>
          ) : treasuryPage ? (
            <TreasuryPage
              campus={campus}
              clubId={clubId}
              setClubId={setClubId}
              coordinatorView={coordinatorView}
            />
          ) : coordinatorView ? (
            <ApprovalPanel campus={campus} now={now} />
          ) : (
            <div className="booking-layout">
              <BookingForm
                campus={campus}
                clubId={clubId}
                setClubId={setClubId}
                auditoriumId={auditoriumId}
                setAuditoriumId={setAuditoriumId}
                slot={slot}
                setSlot={setSlot}
                activeReservations={activeReservations}
                valid={valid}
                available={available}
                onSubmit={book}
              />
              <BookingList
                campus={campus}
                clubId={Number(clubId)}
                auditoriumId={auditoriumId}
                date={slot.date}
                now={now}
              />
            </div>
          )}
          {!campus.loading && !treasuryPage && (
            <EventOutcomes
              campus={campus}
              clubId={Number(clubId)}
              coordinatorView={coordinatorView}
            />
          )}
        </div>
      </main>
      <footer>
        <span>VIT Chennai · CampusChain</span>
        <span>
          Local Ethereum course demo <i /> All times in IST
        </span>
      </footer>
    </div>
  );
}
