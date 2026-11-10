# The owner's computer pulls the encrypted exports with this user. It can list and read exports/ and nothing else: it cannot write, delete, or see any other file,
# so a stolen laptop cannot touch the backups. Create its access key by hand (docs/BACKUP_AND_RESTORE.md): a key made here would sit in the OpenTofu state.
resource "aws_iam_user" "backup_reader" {
  name = "${local.prefix}-backup-reader"
}
resource "aws_iam_user_policy" "backup_reader" {
  name = "read-exports"
  user = aws_iam_user.backup_reader.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "ListExports", Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.b["backups"].arn, Condition = { StringLike = { "s3:prefix" = ["exports/*", "exports/"] } } },
      { Sid = "ReadExports", Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.b["backups"].arn}/exports/*" },
    ]
  })
}
