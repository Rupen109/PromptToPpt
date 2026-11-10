# Backup and restore

Three layers protect the data. Each covers a different failure.

| layer | what | covers | restore window |
|---|---|---|---|
| WAL-G (continuous WAL + base backups at 02:30 and 13:00 India time) in the backups bucket | the whole database, every minute | a bad change, a lost server, "restore to 14:30 yesterday" | 14 days (`backup_retention_days`) |
| EBS snapshots of the data disk (02:00 and 12:30 India time) | the whole disk | a damaged disk, a quick roll-back | 7 of each |
| **Encrypted export, every 2 days, pulled to the owner's computer** (this document) | a `pg_dump` of the whole database, encrypted with the owner's key | the AWS account itself being lost or taken over | the owner's folder (15 exports, about 30 days) |

Pictures are in the assets bucket (versioned, 30 days). They are not part of the export.

## How the export works
`infra/prod/server/export-db.sh` runs from the `slidesdone-export` timer every night at 03:30 India time but only exports when the newest export is 47 hours old, so exports happen about every 2 days and a missed night is caught up. It dumps (`pg_dump -Fc`), reads the archive back to check it, counts the rows of every table, **encrypts with the owner's public key**, uploads to `s3://<backups bucket>/exports/<UTC time>/` (`slidesdone-<time>.dump.gpg`, `SHA256SUMS`, `manifest.json`), and checks the uploaded size. The manifest is uploaded last: an export without it is incomplete and ignored. It refuses to run without the public key; nothing is ever exported unencrypted. The server can add files but never delete (bucket expiry removes exports after 30 days). Because the server only has the public key, a hacked server cannot read old exports.

`scripts/backup/pull-exports.sh` (scheduled daily at 11:00 on the owner's Mac) downloads new exports, verifies the checksum, keeps the newest 15, and shows a Mac notification if a download is damaged or the newest export is older than 96 hours. Its AWS key (`slidesdone-backup-reader`) can only list and read `exports/`.

## One-time setup (the owner)
1. **Make the key pair** (on your Mac; `brew install gnupg libpq awscli`):
   ```
   gpg --quick-generate-key "SlidesDone Backup <you@yourdomain>" rsa4096 encr never   # choose a strong passphrase
   gpg --armor --export you@yourdomain > infra/prod/server/backup-public-key.asc       # the PUBLIC key; safe to commit
   gpg --armor --export-secret-keys you@yourdomain > slidesdone-backup-private.asc     # the PRIVATE key
   ```
   **Store `slidesdone-backup-private.asc` and its passphrase in two safe places that are not the exports folder** (password manager + a USB stick). Without them no export can ever be opened. Never commit it.
2. `cd infra/prod/tofu && tofu plan` (read it), then `tofu apply`. It adds the `exports/` expiry rule, the read-only user and snapshot schedules.
3. Create the reader's key: `aws iam create-access-key --user-name $(tofu output -raw backup_reader_user)` then `aws configure --profile slidesdone-backup-reader` with it.
4. `infra/prod/deploy.sh server` (ships the script, the public key and the timer).
5. On the server: `sudo /opt/slidesdone/export-db.sh --force` once, to see it work.
6. On your Mac: `scripts/backup/install-mac.sh "$(cd infra/prod/tofu && tofu output -raw backups_bucket)"`, then `scripts/backup/pull-exports.sh`.
7. **Run the drill** (below). Until it passes you do not have a backup, you have a hope.

## Restore drill (monthly, and after any change to the backup setup)
`scripts/backup/drill.sh` decrypts the newest export, loads it into a throw-away database on your computer, compares every table's row count with the manifest, and removes the scratch database. It needs a local Postgres (`pnpm db:local`) and prints `DRILL PASSED` or names the table that lost rows.

## If the database is lost (the real thing)
1. Decide the cause first. A bad change or a dead server: use **WAL-G** (`sudo /opt/slidesdone/restore-db.sh ["2026-12-01 14:30:00+00"]`), it loses at most a minute. Use the export below only when WAL-G and the snapshots are gone too (for example the AWS account is lost, or the backups bucket is gone).
2. `scripts/backup/restore.sh` (newest export, or give a time stamp). It shows what the export contains, asks you to type `RESTORE`, decrypts with your private key, checks the dump, and puts it in the bucket under `migrate/`. Needs an admin AWS profile (`RESTORE_AWS_PROFILE` in the config): the reader key cannot write. If the AWS account is new, run `tofu apply` first so the bucket and server exist.
3. On the server, run the command it prints: `sudo /opt/slidesdone/import-dump.sh migrate/restore-<time>.dump`. This stops the app and loads the dump.
4. `infra/prod/deploy.sh server`: applies any newer migrations (forward-only) and starts the app.
5. Check: sign in, open a deck, compare the user and deck counts with the manifest. Then delete the plain dump: `aws s3 rm s3://<bucket>/migrate/restore-<time>.dump`.

What is lost: everything after the export (up to 2 days). Payments after that moment must be re-synced from Razorpay (`webhook_event` replays are idempotent), and users who signed up after it must sign up again.

## Tested (2026-11-10, on this computer, with the real scripts and a fake `docker`/`aws`)
Export of a 260 MB development database, encrypt, upload order, skip when under 47 h, pull, checksum refusal of a damaged copy, keep-newest-N, decrypt and restore into a scratch database with all 43 tables matching; the drill fails when a table is short.
**Not tested (needs the real AWS account):** the timers on the server, `tofu apply`, the reader key's permissions, the launchd job, `scripts/backup/restore.sh` (its upload to AWS), a restore on the production server with `import-dump.sh`. Do steps 5 to 7 above and a full restore on the test server before launch.
