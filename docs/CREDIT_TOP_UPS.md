# Credit top-ups (built 2026-11-27)

What the owner asked for: *"when user out of credits then user can upgrade to some credits (like user can upgrade to current plan again)"*.

## What is sold

**Your own plan, again.** Its monthly credits, at its monthly price, added now.

| On | A top-up gives | For |
|---|---|---|
| Pro | 1,150 credits | ₹300 (or $10) |
| Gold | 2,000 credits | ₹700 (or $19) |
| Premium | 3,700 credits | ₹1,300 (or $35) |
| Starter | — | nothing to buy again: Starter credits are free and renew monthly |

Why this and not a price list of packs:

- **The margin is already decided.** The credits-per-rupee is exactly the plan's, so docs/MARGIN_POLICY.md holds with no new sum, and the January re-pricing changes top-ups automatically (both read `plan.monthly_credits` and `plan_price`).
- **Nothing new to explain.** "Get your month's credits again" needs no table.
- **No way to undercut a plan.** A top-up is never cheaper per credit than the plan it belongs to, so nobody can sit on Pro and buy Gold's volume cheaply.

Buying does **not** touch the subscription: the plan, the renewal date and the billing cycle stay exactly as they were. It is a one-off payment (a Razorpay **order**), not a second subscription.

## Credits that do not expire

`credit_balance` has two pots:

| | Where it comes from | At the monthly reset |
|---|---|---|
| `balance` | the plan's allowance | reset to the allowance (no roll-over, as before) |
| `extra` | top-ups | **untouched** |

The plan's credits are always spent **first**, so buying late in the month never wastes what you bought. `credit_ledger.extra_delta` records how much of each row came from the bought pot, so a refund of failed AI work gives each credit back to the pot it came from.

`GET /me/entitlements` returns `credits.balance` (everything spendable) and `credits.bought` (the part that does not expire).

## The flow

1. `GET /billing/top-up` → what this person would get and pay (`TopUpOffer`). Nothing is created with the provider.
2. `POST /billing/top-up/checkout` → the server reads the plan and its price, writes a `credit_top_up` row (`created`) and creates the provider order. An unpaid order from the last 15 minutes is handed out again, so a double click never makes two orders.
3. The browser pays (Razorpay's window, or our own test window when `PAYMENTS_SIMULATOR` is on).
4. `POST /billing/top-up/verify` → HMAC of `order_id|payment_id` is checked, the order is fetched from the provider, and the credits are granted.
5. The webhook (`order.paid`, `payment.captured`) does the same thing independently.

**Invariants** (the same ones as subscriptions, in `services/api/src/billing/top-ups.ts`):

- Credits, price and currency are decided **server-side** and written down **before** anyone pays. A number sent by the browser is ignored.
- Granting is idempotent twice over: the row only moves `created → paid` once, and the credit grant itself is keyed on the provider payment. The browser's confirmation and the webhook may both run, in any order, any number of times.
- An order that is not paid, or paid for less than it asked, never grants.
- An order belonging to another account is refused even with a valid signature.
- A refunded or disputed top-up payment takes back **its own** credits only (never more than is left) and leaves the plan and the plan's credits alone — unlike a refunded *subscription* payment, which ends the plan.

## Where it shows

- **Out of credits** → the upgrade window leads with "Out of credits? Just top up." and one button; the plans stay below. On any other gate (a locked feature, a monthly limit) the top-up is a quiet second option.
- **Plan & credits page** → how many of your credits were bought, the buy button, and the list of what you bought.
- A receipt e-mail (`creditsToppedUp`) saying what was added, what you have now, and that bought credits do not expire.

## Proof

`services/api/src/billing/top-ups.test.ts` — the offer per plan; the browser cannot choose what it buys; two clicks make one order; a payment grants exactly once across browser + webhook (with the receipt and the payment-history row); webhook-only grants; forged signature, unpaid, underpaid and other-account orders all refused; plan credits spent before bought ones; a reset keeps bought credits; a work refund returns credits to the right pot; a refunded top-up takes back only its own credits and never more than is left.

## Before going live

- Razorpay dashboard: the webhook must also send **`order.paid`** and **`payment.captured`** (subscriptions alone are not enough). See docs/PRODUCTION_RELEASE_CHECKLIST.md.
- USD top-ups need `RAZORPAY_INTERNATIONAL`, exactly like USD subscriptions.
