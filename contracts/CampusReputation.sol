// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice A public reliability record, not a claim of trustless attendance.
contract CampusReputation {
    address public immutable booking;
    mapping(uint256 => uint256) private scores;
    mapping(uint256 => bool) private initialized;
    mapping(uint256 => bool) public recorded;
    error Unauthorized();
    error AlreadyRecorded();
    event ReputationChanged(uint256 indexed clubId, uint256 indexed bookingId, uint256 score);

    constructor() { booking = msg.sender; }
    function score(uint256 clubId) external view returns (uint256) {
        return initialized[clubId] ? scores[clubId] : 50;
    }
    function record(uint256 bookingId, uint256 clubId, int256 change) external {
        if (msg.sender != booking) revert Unauthorized();
        if (recorded[bookingId]) revert AlreadyRecorded();
        recorded[bookingId] = true;
        int256 next = int256(initialized[clubId] ? scores[clubId] : 50) + change;
        scores[clubId] = next < 0 ? 0 : next > 100 ? 100 : uint256(next);
        initialized[clubId] = true;
        emit ReputationChanged(clubId, bookingId, scores[clubId]);
    }
}
