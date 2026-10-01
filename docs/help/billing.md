---
title: Billing
summary: Inspect balances and invoices and follow payment links to mPanel.
keywords: [billing, balance, invoice, payment, credit, charges]
---

# Billing
Use Billing to inspect balance information, unpaid charges and paginated invoices for the active profile. Payment actions open the appropriate mPanel pages; BLDesk does not collect payment-card details itself.

## Check the active account
Confirm the profile before following a payment link. A server action can pause for an unpaid invoice; a submitted action is not proof that the requested change has completed.

## When a figure cannot be loaded
The three cards at the top of Billing show a dash while a figure is still loading. If BinaryLane does not return it, the card keeps showing a dash and says “Couldn't load the account balance.”, “Couldn't load the pending charges.” or “Couldn't load the data transfer usage.” under it, and the Pending Charges tab says “Couldn't load the pending charges.” A dash or one of these messages is not a zero balance or an unlimited allowance: BLDesk shows $0.00 or the word Unlimited only for a figure that has loaded. If a later refresh fails, the card keeps the last figure that loaded. Leaving Billing and opening it again reads the figures again.

The Invoices and Payment Details tabs do the same. A failed invoices read says “Couldn't load the invoices.” and a failed account read says “Couldn't load the payment details.”, each with a Retry button, instead of “No past invoices found.” or “No payment method configured”. If the check for unpaid invoices fails, a line above the cards says “Couldn't check whether any invoices are unpaid.” with a Retry link, and no unpaid-invoice warning is shown or implied.

## Follow a blocked action
Open the outstanding invoice, complete payment through BinaryLane, then check the action's status again. Avoid repeatedly submitting the original mutation while it is blocked.

## Costs and cancellation
The Create Server and Change Plan forms show proposed recurring costs. Read the review before accepting; the API decides availability and the resulting charges. Powering a server off does not cancel its service. Use [Cancel server](help:server-cancel) when you intend to stop the service, and check any final usage invoice.
