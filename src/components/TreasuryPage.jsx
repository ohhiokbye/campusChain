import TreasuryPanel from './TreasuryPanel.jsx';

export default function TreasuryPage({
  campus,
  clubId,
  setClubId,
  coordinatorView,
}) {
  return (
    <>
      {!coordinatorView && (
        <div className="treasury-account">
          <label className="field">
            <span>Your club</span>
            <select
              value={clubId}
              onChange={(event) => setClubId(event.target.value)}
              disabled={Boolean(campus.pending) || !campus.online}
            >
              <option value="">Select your club</option>
              {campus.data.clubs.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p className="form-note">
            Choose the club requesting funding or withdrawing its grant.
          </p>
        </div>
      )}
      <TreasuryPanel
        campus={campus}
        clubId={Number(clubId)}
        coordinatorView={coordinatorView}
      />
    </>
  );
}
