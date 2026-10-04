# Tracking real Google Cloud spend

The owner dashboard computes AI cost from our own usage ledger (every call through the app's gateway × the model's price).
Google bills the **whole project**, so the two can differ. Two tools close the gap; both live in **Owner → Usage → Google Cloud**.

## 1. Readings (works today, no setup)
Google has no public API for the *Free trial status* credit. Read it in Console → Billing → Credits, type it in with the time you read it.
Between two readings the page shows **Google burned**, **we recorded**, **unexplained** and **coverage**. Anything unexplained is spend that
did not go through the gateway (scripts, console experiments, other apps on the same key, blocked-image attempts).
Known cause so far: the template/lab photo scripts called Vertex directly; they now go through the gateway and are ledgered.

## 2. Billing export (live, a few hours behind)
1. Console → Billing → **Billing export → BigQuery export → Standard usage cost** (create a dataset, e.g. `billing_export`). Data starts from that moment — it cannot be back-filled.
2. IAM → Service accounts → create one; grant **BigQuery Job User** (project) and **BigQuery Data Viewer** (the dataset). Create a JSON key.
3. In `services/api/.env`:
   ```
   GCP_BILLING_EXPORT_TABLE=<project>.<dataset>.gcp_billing_export_v1_<BILLING_ACCOUNT_ID>
   GCP_SERVICE_ACCOUNT_JSON=<key JSON, or its base64>
   ```
   Restart the API. The page then lists Vertex / Gemini cost per day and SKU, with credits applied ("You pay" is net of the free-trial credit).

Never commit the key. In production keep it in the secret manager, not in the repo.
