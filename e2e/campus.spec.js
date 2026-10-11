import { test, expect } from '@playwright/test';
import { Contract, JsonRpcProvider } from 'ethers';
import { CLUB_NAMES, AUDITORIUM_NAMES } from '../src/data/campus.js';
import { campusDate } from '../src/lib/booking.js';

let rpc, snapshot, contract;
test.beforeAll(async ({ request }) => {
  rpc = new JsonRpcProvider('http://127.0.0.1:8546', undefined, {
    cacheTimeout: -1,
  });
  const config = await (await request.get('/deployment.e2e.json')).json();
  contract = new Contract(config.address, config.abi, rpc);
  snapshot = await rpc.send('evm_snapshot', []);
});
test.beforeEach(async () => {
  await rpc.send('evm_revert', [snapshot]);
  snapshot = await rpc.send('evm_snapshot', []);
});
test.afterEach(async () => {
  await rpc.send('evm_revert', [snapshot]);
  snapshot = await rpc.send('evm_snapshot', []);
});
test.afterAll(() => rpc?.destroy());

async function open(page) {
  await page.goto('/');
  await expect(
    page.getByText('Local blockchain connected', { exact: true }),
  ).toBeVisible();
}
async function requestSlot(page, club = '1') {
  await page.getByLabel('Your club').selectOption(club);
  await page
    .getByRole('button', { name: 'Request auditorium', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Request confirmed');
}
async function coordinator(page) {
  await page
    .getByRole('button', { name: 'Coordinator view', exact: true })
    .click();
}
async function clubs(page) {
  await page.getByRole('button', { name: /^Club (booking|treasury)$/ }).click();
}

test('catalog and minimal workflow render without browser errors', async ({
  page,
}, testInfo) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page);
  expect(
    await page.getByLabel('Your club').locator('option').allTextContents(),
  ).toEqual(['Select your club', ...CLUB_NAMES]);
  await expect(page.getByRole('radio')).toHaveCount(8);
  for (const name of AUDITORIUM_NAMES)
    await expect(page.getByRole('radio', { name, exact: true })).toBeAttached();
  await expect(
    page.getByRole('button', { name: 'Request auditorium', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: /Manage campus|Connect wallet|Search|Activity log|Check in/,
    }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('desktop-light.png'),
    fullPage: true,
  });
  expect(failures).toEqual([]);
});

test('request holds a slot, coordinator approves, owner cancels, another club rebooks', async ({
  page,
}, testInfo) => {
  await open(page);
  await requestSlot(page);
  await expect(page.locator('.booking-status')).toHaveText('Pending');
  await expect(page.locator('.booking-deadline')).toContainText(
    'Approve before',
  );
  await page.getByLabel('Your club').selectOption('2');
  await expect(
    page.getByText('This time slot is already reserved'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cancel booking', exact: true }),
  ).toHaveCount(0);
  await coordinator(page);
  await expect(
    page.getByRole('article', { name: 'Request 1', exact: true }),
  ).toContainText(CLUB_NAMES[0]);
  await page.screenshot({
    path: testInfo.outputPath('coordinator.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Approve request 1', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Approval confirmed');
  await expect(page.getByText('No requests awaiting approval.')).toBeVisible();
  await clubs(page);
  await expect(page.locator('.booking-status')).toHaveText('Approved');
  await expect(
    page.getByRole('button', { name: 'Request auditorium', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Your club').selectOption('1');
  await page
    .getByRole('button', { name: 'Cancel booking', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Cancellation confirmed',
  );
  await expect(page.locator('.booking-status')).toHaveText('Cancelled');
  await requestSlot(page, '2');
  await expect(page.locator('.booking-row')).toHaveCount(2);
  expect((await contract.getBooking(2)).clubId).toBe(2n);
});

test('rejection releases the slot and keeps the rejected record', async ({
  page,
}) => {
  await open(page);
  await requestSlot(page);
  await coordinator(page);
  await page
    .getByRole('button', { name: 'Reject request 1', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Rejection confirmed');
  await clubs(page);
  await expect(page.locator('.booking-status')).toHaveText('Rejected');
  await expect(
    page.getByRole('button', { name: 'Cancel booking', exact: true }),
  ).toHaveCount(0);
  await requestSlot(page, '2');
  await expect(page.locator('.booking-row')).toHaveCount(2);
});

test('cancelling pending removes it from the approval queue and allows adjacent slots', async ({
  page,
}) => {
  await open(page);
  await requestSlot(page);
  await page
    .getByRole('button', { name: 'Cancel booking', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Cancellation confirmed',
  );
  await coordinator(page);
  await expect(page.getByText('No requests awaiting approval.')).toBeVisible();
  await clubs(page);
  await requestSlot(page, '2');
  await page.getByLabel('End time').fill('12:00');
  await page.getByLabel('Start time').fill('11:00');
  await requestSlot(page);
  await expect(page.locator('.booking-row')).toHaveCount(3);
});

test('coordinator sees every venue and date, including the last club and auditorium', async ({
  page,
}) => {
  await open(page);
  await requestSlot(page);
  await page.getByText('MBA-amphitheatre', { exact: true }).click();
  await page
    .getByLabel('Booking date')
    .fill(campusDate(new Date(Date.now() + 3 * 86400000)));
  await requestSlot(page, '50');
  await coordinator(page);
  await expect(page.locator('.approval-row')).toHaveCount(2);
  await expect(
    page.getByRole('article', { name: 'Request 2', exact: true }),
  ).toContainText('ANDROID CLUB');
  await expect(
    page.getByRole('article', { name: 'Request 2', exact: true }),
  ).toContainText('MBA-amphitheatre');
  await page
    .getByRole('button', { name: 'Approve request 2', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Approval confirmed');
  await clubs(page);
  await expect(page.locator('.booking-status')).toHaveText('Approved');
  expect((await contract.getBooking(2)).clubId).toBe(50n);
  expect((await contract.getBooking(2)).auditoriumId).toBe(8n);
});

test('expiry refreshes the queue and availability without a cleanup transaction', async ({
  page,
}) => {
  await open(page);
  await page
    .getByLabel('Booking date')
    .fill(campusDate(new Date(Date.now() + 4 * 86400000)));
  await requestSlot(page);
  const deadline = (await contract.getBooking(1)).approvalDeadline;
  await coordinator(page);
  await expect(page.locator('.approval-row')).toHaveCount(1);
  await rpc.send('evm_setNextBlockTimestamp', [Number(deadline)]);
  await rpc.send('evm_mine', []);
  await expect(page.getByText('No requests awaiting approval.')).toBeVisible({
    timeout: 12000,
  });
  expect(await contract.bookingCount()).toBe(1n);
  await clubs(page);
  await expect(page.locator('.booking-status')).toHaveText('Expired');
  await expect(page.getByText('This time slot is available')).toBeVisible();
  await requestSlot(page, '2');
  await expect(page.locator('.booking-row')).toHaveCount(2);
  expect((await contract.getBooking(1)).status).toBe(4n);
});

test('role and form controls stay locked during a pending transaction', async ({
  page,
}) => {
  await open(page);
  await rpc.send('evm_setIntervalMining', [0]);
  await rpc.send('evm_setAutomine', [false]);
  try {
    await page.getByLabel('Your club').selectOption('1');
    await page
      .getByRole('button', { name: 'Request auditorium', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Coordinator view', exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel('Your club')).toBeDisabled();
    await expect
      .poll(
        async () =>
          (await rpc.send('eth_getBlockByNumber', ['pending', false]))
            .transactions.length,
      )
      .toBe(1);
    await rpc.send('evm_mine', []);
    await expect(page.getByRole('status')).toContainText('Request confirmed');
    await expect(
      page.getByRole('button', { name: 'Coordinator view', exact: true }),
    ).toBeEnabled();
  } finally {
    await rpc.send('evm_setAutomine', [true]);
    await rpc.send('evm_setIntervalMining', [5000]);
  }
});

test('dark mode follows OS preference, persists an override, and supports keyboard toggle', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: testInfo.outputPath('desktop-dark.png'),
    fullPage: true,
  });
  const toggle = page.getByRole('button', {
    name: 'Switch to light mode',
    exact: true,
  });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page
    .getByRole('button', { name: 'Switch to dark mode', exact: true })
    .click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('mobile form and approval actions fit in both themes and block invalid intervals', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await open(page);
  await page.getByLabel('Your club').selectOption('1');
  await page.getByLabel('End time').fill('09:00');
  await expect(
    page.getByRole('button', { name: 'Request auditorium', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('End time').fill('11:00');
  for (const theme of ['light', 'dark']) {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(`mobile-${theme}.png`),
      fullPage: true,
    });
    if (theme === 'light')
      await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  }
  await requestSlot(page);
  await coordinator(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page
    .getByRole('button', { name: 'Approve request 1', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Approval confirmed');
});

test('development node advances time without transactions', async () => {
  const before = (await rpc.getBlock('latest')).timestamp;
  await expect
    .poll(async () => (await rpc.getBlock('latest')).timestamp, {
      timeout: 10000,
      intervals: [500, 1000],
    })
    .toBeGreaterThan(before);
});

test('funding follows approval, optimistic completion and separate withdrawals', async ({
  page,
}) => {
  await open(page);
  await requestSlot(page);
  await coordinator(page);
  await page
    .getByRole('button', { name: 'Approve request 1', exact: true })
    .click();
  await page.locator('.council-selector select').selectOption('51');
  await page
    .getByRole('button', { name: 'Approve request 1', exact: true })
    .click();
  await clubs(page);
  await page.getByRole('link', { name: 'Treasury', exact: true }).click();
  await page.getByRole('button', { name: 'Donate', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Donation confirmed');
  await page
    .getByLabel('Purpose', { exact: true })
    .fill('Event equipment and materials');
  await page
    .getByRole('button', { name: 'Request grant', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Grant request confirmed',
  );
  await coordinator(page);
  await page.locator('.council-selector select').selectOption('0');
  await page
    .getByRole('button', { name: 'Approve grant', exact: true })
    .click();
  await page.locator('.council-selector select').selectOption('51');
  await page
    .getByRole('button', { name: 'Approve grant', exact: true })
    .click();
  await expect(page.locator('.treasury-metrics')).toContainText('0.35');
  await clubs(page);
  await expect(page.locator('.withdraw-row')).toContainText('0.15 ETH');
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Withdrawal confirmed');
  const row = await contract.getBooking(1);
  await rpc.send('evm_setNextBlockTimestamp', [Number(row.endTime)]);
  await rpc.send('evm_mine', []);
  await page.getByRole('link', { name: 'Bookings', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Claim completion', exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await page
    .getByRole('button', { name: 'Claim completion', exact: true })
    .click();
  await rpc.send('evm_setNextBlockTimestamp', [
    Number(row.endTime) + 48 * 3600,
  ]);
  await rpc.send('evm_mine', []);
  await expect(
    page.getByRole('button', { name: 'Finalize completion', exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await page
    .getByRole('button', { name: 'Finalize completion', exact: true })
    .click();
  await expect(page.locator('.reputation-note')).toContainText('55/100');
  await page.getByRole('link', { name: 'Treasury', exact: true }).click();
  await expect(page.locator('.withdraw-row')).toContainText('0.35 ETH');
  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Withdrawal confirmed');
  await expect(
    page.getByRole('button', { name: 'Withdraw', exact: true }),
  ).toBeDisabled();
  expect((await contract.getBooking(1)).status).toBe(5n);
});
