# CampusChain · VIT Chennai

A **Campus Resource & Treasury Protocol** featuring a 3-layer architecture: optimistic execution with fraud challenge windows, 2-of-3 multi-stakeholder council governance, and milestone-based treasury grants.

## Run

Requires Node.js 22.13 or newer.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The launcher starts Hardhat with 53 funded test accounts, deploys the contracts, and serves React.

- Account 0: **Faculty Dean** (Council member 1)
- Account 51: **Student Council President** (Council member 2)
- Account 52: **Campus Estate Manager** (Council member 3)
- Accounts 1–50: **Student Clubs**

No external wallet extension is required. All funds are **local test ETH**.

If a demo node is already running, `npm run deploy` deploys a fresh protocol and updates configuration. Restarting `npm run dev` creates a new local chain and clears history.

## Key Mechanisms

1. **3-Layer Architecture:**
   - **Layer 1 (Normal Operations - Optimistic Execution):** The club calls `claimEventCompleted()` after their event. A 48-hour challenge window opens. If unchallenged, anyone can call `finalizeCompletion()`.
   - **Layer 2 (Governance & Disputes - 2-of-3 Council):** Booking approvals, grant approvals, dispute resolutions, and council rotations require 2 of 3 votes across the Dean, Student President, and Estate Manager.
   - **Layer 3 (Failure Recovery - Liveness Fallback):** Permissionless 48-hour expiry on unapproved booking requests, and a 7-day timeout (`closeUnverified()`) ensuring funds are never permanently locked.

2. **Resource Allocation Rules:**
   - Names-only catalog: 50 distinct club names and 8 auditorium venues.
   - Quotas: 2 active reservations per club, max 8 hours duration, up to 14 days in advance.
   - Pending booking holds expire at `min(startTime, block.timestamp + 48 hours)`.

3. **Reputation Bounds:**
   - Initial score: 50/100 (clamped strictly within `[0, 100]`).
   - Successful completion: +5.
   - Confirmed no-show / fraud: -15.
   - Cancellation < 24h before event: -5.

4. **Treasury & Milestone Grants:**
   - Anyone may donate test ETH to the campus treasury.
   - Clubs can request 1 grant per approved future booking.
   - 2-of-3 Council approval immediately releases a **30% preparation advance** and reserves the **70% final milestone**.
   - Verified completion releases the remaining 70%; cancellation or failure unlocks the reserve back to available treasury funds.

## Architecture

React → ethers → local Hardhat node → **CampusBooking**, **CampusReputation**, and **CampusTreasury**. No centralized backend, off-chain database, or proprietary token.

- [Component explanation](docs/COMPONENTS.md)
- [Architecture and state machines](docs/PROJECT.md)
- [Demo and professor Q&A](docs/DEMO.md)
- [Syllabus mapping and research](docs/COURSE_AND_RESEARCH.md)

## Validation

All 43 tests pass cleanly:

```sh
npm test             # 43 contract, accounting, council threshold & optimistic scenarios
npm run build        # compile Solidity (0.8.30 optimizer 200) and build React
npm run test:e2e     # browser scenarios on isolated local node (Playwright)
```
