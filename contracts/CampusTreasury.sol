// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ICampusBooking {
    function grantContext(uint256 id) external view returns (address club, uint256 startTime, uint8 status);
    function isCouncilMember(address account) external view returns (bool);
}

/// @notice Test-ETH grants: available funds, reserves and withdrawal credits never overlap.
contract CampusTreasury {
    enum State { None, Pending, Approved, Rejected, Completed, Released, Expired }
    struct Grant { uint256 bookingId; address club; uint256 amount; uint256 remaining; string purpose; State state; }
    address public immutable booking;
    uint256 public reserved;
    uint256 public liabilities;
    mapping(uint256 => Grant) private grants;
    mapping(address => uint256) public credits;
    mapping(uint256 => mapping(address => bool)) public grantVotes;
    mapping(uint256 => uint8) public grantApprovals;
    mapping(uint256 => uint8) public grantRejections;
    bool private withdrawing;
    error Unauthorized();
    error AlreadyVoted();
    error InvalidGrant();
    error GrantExists();
    error GrantNotPending();
    error InsufficientFunds();
    error NothingToWithdraw();
    error TransferFailed();
    error ReentrantCall();
    event Donated(address indexed donor, uint256 amount);
    event GrantRequested(uint256 indexed bookingId, address indexed club, uint256 amount, string purpose);
    event GrantVoteCast(uint256 indexed bookingId, address indexed member, bool approve, uint8 count);
    event GrantApproved(uint256 indexed bookingId, uint256 preparation, uint256 reservedAmount);
    event GrantRejected(uint256 indexed bookingId);
    event GrantSettled(uint256 indexed bookingId, bool completed, uint256 amount);
    event Withdrawn(address indexed club, uint256 amount);

    constructor() { booking = msg.sender; }
    function donate() external payable { _donate(); }
    receive() external payable { _donate(); }
    function _donate() private { if (msg.value == 0) revert InvalidGrant(); emit Donated(msg.sender, msg.value); }
    function available() public view returns (uint256) { return address(this).balance - reserved - liabilities; }
    function requestGrant(uint256 id, uint256 amount, string calldata purpose) external {
        (address club, uint256 start, uint8 status) = ICampusBooking(booking).grantContext(id);
        if (msg.sender != club) revert Unauthorized();
        if (status != 1 || block.timestamp >= start || amount < 10 || bytes(purpose).length == 0 || bytes(purpose).length > 280) revert InvalidGrant();
        if (grants[id].state != State.None) revert GrantExists();
        grants[id] = Grant(id, club, amount, 0, purpose, State.Pending);
        emit GrantRequested(id, club, amount, purpose);
    }
    function approveGrant(uint256 id) external {
        _requirePendingCouncil(id);
        Grant storage grant = grants[id];
        if (grant.amount > available()) revert InsufficientFunds();
        if (grantVotes[id][msg.sender]) revert AlreadyVoted();
        grantVotes[id][msg.sender] = true;
        uint8 count = ++grantApprovals[id];
        emit GrantVoteCast(id, msg.sender, true, count);
        if (count >= 2) {
            uint256 preparation = grant.amount * 30 / 100;
            grant.remaining = grant.amount - preparation;
            grant.state = State.Approved;
            reserved += grant.remaining;
            liabilities += preparation;
            credits[grant.club] += preparation;
            emit GrantApproved(id, preparation, grant.remaining);
        }
    }
    function rejectGrant(uint256 id) external {
        _requirePendingCouncil(id);
        if (grantVotes[id][msg.sender]) revert AlreadyVoted();
        grantVotes[id][msg.sender] = true;
        uint8 count = ++grantRejections[id];
        emit GrantVoteCast(id, msg.sender, false, count);
        if (count >= 2) {
            grants[id].state = State.Rejected;
            emit GrantRejected(id);
        }
    }
    function _requirePendingCouncil(uint256 id) private view {
        if (!ICampusBooking(booking).isCouncilMember(msg.sender)) revert Unauthorized();
        if (getGrant(id).state != State.Pending) revert GrantNotPending();
    }
    function getGrant(uint256 id) public view returns (Grant memory grant) {
        grant = grants[id];
        if (grant.state == State.Pending) {
            (, uint256 start, uint8 status) = ICampusBooking(booking).grantContext(id);
            if (status != 1 || block.timestamp >= start) grant.state = State.Expired;
        }
    }
    /// @dev Booking calls once on a final outcome; no external payment occurs here.
    function settle(uint256 id, bool completed) external {
        if (msg.sender != booking) revert Unauthorized();
        Grant storage grant = grants[id];
        if (grant.state == State.Pending) { grant.state = State.Expired; return; }
        if (grant.state != State.Approved) return;
        uint256 amount = grant.remaining;
        grant.remaining = 0;
        reserved -= amount;
        grant.state = completed ? State.Completed : State.Released;
        if (completed) { credits[grant.club] += amount; liabilities += amount; }
        emit GrantSettled(id, completed, amount);
    }
    function withdraw() external {
        if (withdrawing) revert ReentrantCall();
        uint256 amount = credits[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawing = true;
        credits[msg.sender] = 0;
        liabilities -= amount;
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert TransferFailed();
        withdrawing = false;
        emit Withdrawn(msg.sender, amount);
    }
}
