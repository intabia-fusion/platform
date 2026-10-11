# Billing mail layout

Область: [Биллинг](../features/billing.md)

Customer mail of the payment pods (`packages/billing-mail`: upcoming, expired, receipt, dunning) is
rendered separately from the account mail (`server/account/lang/*.json`). Until 2026-10 it was bare
`<p>`/`<b>` with no document or width, so clients showed it full-width in their default font.

## Non-obvious

- `renderLayout` in `render.ts` copies the OTP card markup by hand. A style change to the account
  letters has to be repeated there, or the two families drift apart again.
- Header/footer name: `PRODUCT_NAME` in pod-payment and pod-tbank-subscriptions, the same variable
  account-service reads. An unset compose variable arrives as `''`, so empty also falls back to
  `DEFAULT_PRODUCT_NAME`.
- Receipt row values were not escaped before, and the payer name is user-controlled. All row values now go through `escapeHtml`.
- Service copies to `BILLING_EMAILS` stay `<pre>`. They are a team audit trail, not customer mail.
