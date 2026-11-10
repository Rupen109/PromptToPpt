# Three private buckets with different jobs:
#   editor   the editor's static files, read only by CloudFront (Origin Access Control)
#   assets   pictures people upload or generate (served through the API, cached by CloudFront), plus the deploy files
#   backups  WAL-G base backups and WAL. The server may write and read, never delete: old backups are removed by the bucket's own expiry rule.
locals {
  buckets = {
    editor  = "${local.prefix}-editor-${local.account}"
    assets  = "${local.prefix}-assets-${local.account}"
    backups = "${local.prefix}-backups-${local.account}"
  }
}

resource "aws_s3_bucket" "b" {
  for_each = local.buckets
  bucket   = each.value
}
resource "aws_s3_bucket_public_access_block" "b" {
  for_each                = aws_s3_bucket.b
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "b" {
  for_each = aws_s3_bucket.b
  bucket   = each.value.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_ownership_controls" "b" {
  for_each = aws_s3_bucket.b
  bucket   = each.value.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

# a picture deleted by mistake can be brought back for 30 days
resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.b["assets"].id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket     = aws_s3_bucket.b["assets"].id
  depends_on = [aws_s3_bucket_versioning.assets]
  rule {
    id     = "old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 30 }
    abort_incomplete_multipart_upload { days_after_initiation = 2 }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.b["backups"].id
  # base backups and WAL expire together, so every kept base backup still has the WAL after it (restore window = retention minus one day)
  rule {
    id     = "wal-g"
    status = "Enabled"
    filter { prefix = "wal-g/" }
    expiration { days = var.backup_retention_days }
  }
  # encrypted exports for the owner (export-db.sh): the last 30 days stay, the owner's computer keeps its own copies
  rule {
    id     = "owner-exports"
    status = "Enabled"
    filter { prefix = "exports/" }
    expiration { days = 30 }
  }
  rule {
    id     = "migration-dumps"
    status = "Enabled"
    filter { prefix = "migrate/" }
    expiration { days = 30 }
  }
  rule {
    id     = "abort-partial-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 2 }
  }
}

# only CloudFront (this account's editor distribution) may read the editor files
resource "aws_s3_bucket_policy" "editor" {
  bucket = aws_s3_bucket.b["editor"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "CloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.b["editor"].arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.editor.arn } }
    }]
  })
}

# container images, tagged by git commit; a tag can never be overwritten
resource "aws_ecr_repository" "r" {
  for_each             = toset(["api", "web", "caddy", "postgres"])
  name                 = "${local.prefix}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false
  image_scanning_configuration { scan_on_push = true }
}
resource "aws_ecr_lifecycle_policy" "r" {
  for_each   = aws_ecr_repository.r
  repository = each.value.name
  policy = jsonencode({
    rules = [{ rulePriority = 1, description = "keep the last 10 images", selection = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }, action = { type = "expire" } }]
  })
}
