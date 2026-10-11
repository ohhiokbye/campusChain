// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "./CampusReputation.sol";
import "./CampusTreasury.sol";

/// @title CampusBooking
/// @notice Fixed campus catalog with optimistic execution and 2-of-3 council governance.
contract CampusBooking {
    enum Status { Pending, Approved, Rejected, Cancelled, Expired, Completed, NoShow, Unverified, Claimed, Disputed }
    struct Booking {
        uint256 id;
        uint256 auditoriumId;
        uint256 clubId;
        uint256 startTime;
        uint256 endTime;
        uint256 approvalDeadline;
        uint256 challengeDeadline;
        Status status;
    }

    string[] private clubNames;
    string[] private auditoriumNames;
    mapping(address => uint256) public clubIds;
    mapping(uint256 => Booking) private bookings;
    mapping(uint256 => uint256[]) private auditoriumBookings;
    uint256 public bookingCount;
    address[3] public council;
    mapping(address => bool) public isCouncilMember;
    CampusReputation public immutable reputation;
    CampusTreasury public immutable treasury;
    mapping(uint256 => address) public clubWallets;
    uint256 public constant VERIFICATION_WINDOW = 7 days;
    uint256 public constant CHALLENGE_WINDOW = 48 hours;

    mapping(uint256 => mapping(address => bool)) public bookingVotes;
    mapping(uint256 => uint8) public bookingApprovals;
    mapping(uint256 => uint8) public bookingRejections;

    mapping(uint256 => mapping(address => bool)) public disputeVotes;
    mapping(uint256 => uint8) public disputeCompletedVotes;
    mapping(uint256 => uint8) public disputeNoShowVotes;

    mapping(bytes32 => uint8) public councilReplacementVotes;
    mapping(bytes32 => mapping(address => bool)) public councilReplacementVoted;

    error BookingLimit();
    error BookingWindow();
    error DurationLimit();
    error VerificationUnavailable();
    error InvalidCatalog();
    error ClubNotRegistered();
    error AuditoriumNotFound();
    error InvalidTimeRange();
    error StartNotInFuture();
    error BookingConflict(uint256 bookingId);
    error BookingNotFound();
    error NotBookingOwner();
    error NotCouncilMember();
    error BookingNotPending();
    error BookingNotActive();
    error ApprovalExpired();
    error BookingAlreadyStarted();
    error AlreadyVoted();
    error InvalidBookingState();
    error EventNotEnded();
    error NotInChallengePeriod();
    error ChallengePeriodActive();
    error ChallengePeriodEnded();
    error NotDisputed();
    error Unauthorized();
    error InvalidCouncilMember();

    event OutcomeRecorded(uint256 indexed bookingId, Status status);
    event BookingRequested(uint256 indexed bookingId, uint256 indexed auditoriumId, uint256 indexed clubId, uint256 startTime, uint256 endTime, uint256 approvalDeadline);
    event BookingVoteCast(uint256 indexed bookingId, address indexed member, bool approve, uint8 count);
    event BookingApproved(uint256 indexed bookingId);
    event BookingRejected(uint256 indexed bookingId);
    event BookingCancelled(uint256 indexed bookingId, uint256 indexed auditoriumId, uint256 indexed clubId);
    event EventClaimed(uint256 indexed bookingId, uint256 challengeDeadline);
    event EventChallenged(uint256 indexed bookingId, address indexed challenger);
    event DisputeVoteCast(uint256 indexed bookingId, address indexed member, bool completed, uint8 count);
    event CouncilReplacementVote(address indexed oldMember, address indexed newMember, address indexed voter, uint8 count);
    event CouncilMemberReplaced(address indexed oldMember, address indexed newMember);

    constructor(string[] memory names, address[] memory wallets, string[] memory auditoriums, address[3] memory _council) {
        if (names.length == 0 || names.length != wallets.length || auditoriums.length == 0) revert InvalidCatalog();
        for (uint256 c = 0; c < 3; ++c) {
            if (_council[c] == address(0) || isCouncilMember[_council[c]]) revert InvalidCouncilMember();
            isCouncilMember[_council[c]] = true;
            council[c] = _council[c];
        }
        reputation = new CampusReputation();
        treasury = new CampusTreasury();
        for (uint256 i; i < names.length; ++i) {
            if (bytes(names[i]).length == 0 || wallets[i] == address(0) || isCouncilMember[wallets[i]] || clubIds[wallets[i]] != 0) revert InvalidCatalog();
            clubIds[wallets[i]] = i + 1;
            clubWallets[i + 1] = wallets[i];
        }
        for (uint256 i; i < auditoriums.length; ++i) {
            if (bytes(auditoriums[i]).length == 0) revert InvalidCatalog();
        }
        clubNames = names;
        auditoriumNames = auditoriums;
    }

    function getClubNames() external view returns (string[] memory) { return clubNames; }
    function getAuditoriumNames() external view returns (string[] memory) { return auditoriumNames; }
    function getCouncil() external view returns (address[3] memory) { return council; }

    function requestBooking(uint256 auditoriumId, uint256 startTime, uint256 endTime) external {
        uint256 clubId = clubIds[msg.sender];
        if (clubId == 0) revert ClubNotRegistered();
        _requireAuditorium(auditoriumId);
        _requireTimeRange(startTime, endTime);
        if (startTime <= block.timestamp) revert StartNotInFuture();
        if (startTime > block.timestamp + 14 days) revert BookingWindow();
        if (endTime - startTime > 8 hours) revert DurationLimit();
        if (activeBookings(clubId) >= 2) revert BookingLimit();
        uint256 conflict = _findConflict(auditoriumId, startTime, endTime);
        if (conflict != 0) revert BookingConflict(conflict);

        uint256 deadline = block.timestamp + 48 hours;
        if (startTime < deadline) deadline = startTime;
        uint256 id = ++bookingCount;
        bookings[id] = Booking(id, auditoriumId, clubId, startTime, endTime, deadline, 0, Status.Pending);
        auditoriumBookings[auditoriumId].push(id);
        emit BookingRequested(id, auditoriumId, clubId, startTime, endTime, deadline);
    }

    function approveBooking(uint256 bookingId) external {
        if (!isCouncilMember[msg.sender]) revert NotCouncilMember();
        _requireBooking(bookingId);
        Booking storage booking = bookings[bookingId];
        if (booking.status != Status.Pending) revert BookingNotPending();
        if (block.timestamp >= booking.approvalDeadline) revert ApprovalExpired();
        if (bookingVotes[bookingId][msg.sender]) revert AlreadyVoted();
        bookingVotes[bookingId][msg.sender] = true;
        uint8 approvals = ++bookingApprovals[bookingId];
        emit BookingVoteCast(bookingId, msg.sender, true, approvals);
        if (approvals >= 2) {
            booking.status = Status.Approved;
            emit BookingApproved(bookingId);
        }
    }

    function rejectBooking(uint256 bookingId) external {
        if (!isCouncilMember[msg.sender]) revert NotCouncilMember();
        _requireBooking(bookingId);
        Booking storage booking = bookings[bookingId];
        if (booking.status != Status.Pending) revert BookingNotPending();
        if (block.timestamp >= booking.approvalDeadline) revert ApprovalExpired();
        if (bookingVotes[bookingId][msg.sender]) revert AlreadyVoted();
        bookingVotes[bookingId][msg.sender] = true;
        uint8 rejections = ++bookingRejections[bookingId];
        emit BookingVoteCast(bookingId, msg.sender, false, rejections);
        if (rejections >= 2) {
            booking.status = Status.Rejected;
            emit BookingRejected(bookingId);
        }
    }

    function cancelBooking(uint256 bookingId) external {
        _requireBooking(bookingId);
        Booking storage booking = bookings[bookingId];
        if (clubIds[msg.sender] != booking.clubId) revert NotBookingOwner();
        if (booking.status == Status.Pending && block.timestamp >= booking.approvalDeadline) revert ApprovalExpired();
        if (booking.status != Status.Pending && booking.status != Status.Approved) revert BookingNotActive();
        if (block.timestamp >= booking.startTime) revert BookingAlreadyStarted();
        bool late = booking.status == Status.Approved && booking.startTime - block.timestamp < 24 hours;
        booking.status = Status.Cancelled;
        reputation.record(booking.id, booking.clubId, late ? int256(-5) : int256(0));
        treasury.settle(bookingId, false);
        emit BookingCancelled(bookingId, booking.auditoriumId, booking.clubId);
    }

    function activeBookings(uint256 clubId) public view returns (uint256 count) {
        for (uint256 i = 1; i <= bookingCount; ++i) {
            Booking storage b = bookings[i];
            if (b.clubId == clubId && b.endTime > block.timestamp &&
                (b.status == Status.Approved || (b.status == Status.Pending && block.timestamp < b.approvalDeadline))) ++count;
        }
    }

    function grantContext(uint256 id) external view returns (address club, uint256 startTime, uint8 status) {
        _requireBooking(id);
        Booking storage b = bookings[id];
        return (clubWallets[b.clubId], b.startTime, uint8(b.status));
    }

    // --- Optimistic Execution & Disputes ---

    function claimEventCompleted(uint256 id) external {
        _requireBooking(id);
        Booking storage b = bookings[id];
        if (clubIds[msg.sender] != b.clubId) revert NotBookingOwner();
        if (b.status != Status.Approved) revert InvalidBookingState();
        if (block.timestamp < b.endTime) revert EventNotEnded();
        if (block.timestamp >= b.endTime + VERIFICATION_WINDOW) revert VerificationUnavailable();
        b.status = Status.Claimed;
        b.challengeDeadline = block.timestamp + CHALLENGE_WINDOW;
        emit EventClaimed(id, b.challengeDeadline);
    }

    function challengeEvent(uint256 id) external {
        if (!isCouncilMember[msg.sender] && clubIds[msg.sender] == 0) revert Unauthorized();
        _requireBooking(id);
        Booking storage b = bookings[id];
        if (b.status != Status.Claimed) revert NotInChallengePeriod();
        if (block.timestamp >= b.challengeDeadline) revert ChallengePeriodEnded();
        b.status = Status.Disputed;
        emit EventChallenged(id, msg.sender);
    }

    function finalizeCompletion(uint256 id) external {
        _requireBooking(id);
        Booking storage b = bookings[id];
        if (b.status != Status.Claimed) revert NotInChallengePeriod();
        if (block.timestamp < b.challengeDeadline) revert ChallengePeriodActive();
        _finish(b, Status.Completed, int256(5));
    }

    function resolveDispute(uint256 id, bool completed) external {
        if (!isCouncilMember[msg.sender]) revert NotCouncilMember();
        _requireBooking(id);
        Booking storage b = bookings[id];
        if (b.status != Status.Disputed) revert NotDisputed();
        if (disputeVotes[id][msg.sender]) revert AlreadyVoted();
        disputeVotes[id][msg.sender] = true;
        if (completed) {
            uint8 count = ++disputeCompletedVotes[id];
            emit DisputeVoteCast(id, msg.sender, true, count);
            if (count >= 2) {
                _finish(b, Status.Completed, int256(5));
            }
        } else {
            uint8 count = ++disputeNoShowVotes[id];
            emit DisputeVoteCast(id, msg.sender, false, count);
            if (count >= 2) {
                _finish(b, Status.NoShow, int256(-15));
            }
        }
    }

    function closeUnverified(uint256 id) external {
        _requireBooking(id);
        Booking storage b = bookings[id];
        if ((b.status != Status.Approved && b.status != Status.Disputed && b.status != Status.Claimed) || block.timestamp < b.endTime + VERIFICATION_WINDOW) revert VerificationUnavailable();
        _finish(b, Status.Unverified, 0);
    }

    function replaceCouncilMember(address oldMember, address newMember) external {
        if (!isCouncilMember[msg.sender] || !isCouncilMember[oldMember]) revert NotCouncilMember();
        if (newMember == address(0) || isCouncilMember[newMember] || clubIds[newMember] != 0) revert InvalidCouncilMember();
        bytes32 proposalHash = keccak256(abi.encodePacked(oldMember, newMember));
        if (councilReplacementVoted[proposalHash][msg.sender]) revert AlreadyVoted();
        councilReplacementVoted[proposalHash][msg.sender] = true;
        uint8 count = ++councilReplacementVotes[proposalHash];
        emit CouncilReplacementVote(oldMember, newMember, msg.sender, count);
        if (count >= 2) {
            isCouncilMember[oldMember] = false;
            isCouncilMember[newMember] = true;
            for (uint256 i = 0; i < 3; ++i) {
                if (council[i] == oldMember) {
                    council[i] = newMember;
                    break;
                }
            }
            emit CouncilMemberReplaced(oldMember, newMember);
        }
    }

    function _finish(Booking storage b, Status status, int256 change) private {
        b.status = status;
        reputation.record(b.id, b.clubId, change);
        treasury.settle(b.id, status == Status.Completed);
        emit OutcomeRecorded(b.id, status);
    }

    function isAvailable(uint256 auditoriumId, uint256 startTime, uint256 endTime) external view returns (bool) {
        _requireAuditorium(auditoriumId);
        _requireTimeRange(startTime, endTime);
        return startTime > block.timestamp && _findConflict(auditoriumId, startTime, endTime) == 0;
    }

    function getBooking(uint256 bookingId) external view returns (Booking memory booking) {
        _requireBooking(bookingId);
        booking = bookings[bookingId];
        if (booking.status == Status.Pending && block.timestamp >= booking.approvalDeadline) booking.status = Status.Expired;
    }

    function _findConflict(uint256 auditoriumId, uint256 startTime, uint256 endTime) private view returns (uint256) {
        uint256[] storage ids = auditoriumBookings[auditoriumId];
        for (uint256 i; i < ids.length; ++i) {
            Booking storage existing = bookings[ids[i]];
            bool holdsSlot = existing.status == Status.Approved ||
                (existing.status == Status.Pending && block.timestamp < existing.approvalDeadline);
            if (holdsSlot && startTime < existing.endTime && endTime > existing.startTime) return ids[i];
        }
        return 0;
    }

    function _requireAuditorium(uint256 id) private view {
        if (id == 0 || id > auditoriumNames.length) revert AuditoriumNotFound();
    }
    function _requireBooking(uint256 id) private view {
        if (id == 0 || id > bookingCount) revert BookingNotFound();
    }
    function _requireTimeRange(uint256 startTime, uint256 endTime) private pure {
        if (endTime <= startTime) revert InvalidTimeRange();
    }
}
