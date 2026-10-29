# Payment provider configuration

Apply platform migration `0028_payment_providers.sql` before deploying the Cloud and Admin changes. The migration copies the legacy encrypted Creem credentials into a read-only provider profile, selects that profile for existing installations, and disables automatic Creem synchronization. It preserves the payment switch and purchase method introduced in PR #503.

Admin → Payments supports multiple named provider profiles and an independent current-provider selection. Profiles have a stable ID, display name, test/live environment and an encrypted credentials JSON object. Credential fields depend on the future provider adapter; use string keys and values. Leaving the credentials field blank preserves the saved values. Credentials never appear in configuration responses or audit records. Saves and selection changes require an audit reason and the current revision.

Creem is retired. It cannot create checkouts, open a customer portal, accept webhooks, synchronize products or subscriptions, replay events, recover test checkouts, or process checkout returns. Historical subscriptions remain read-only. Existing paid-through entitlements continue to use the ordinary local subscription expiry rules. Account erasure does not contact Creem because its historical subscriptions were sandbox-only.

This change adds configuration storage and selection, not a new payment adapter. New profiles are marked `not_integrated`, and Creem is marked `retired`. Selecting a profile does not make it executable. Public catalogs report online payment unavailable until a supported adapter is implemented. The existing disabled-payment and activation-code purchase behavior is unchanged.

Scheduled local webhook-payload retention continues even when payments are disabled. No provider work is queued or processed. The old Creem webhook URL returns HTTP 410 without accepting the payload.
