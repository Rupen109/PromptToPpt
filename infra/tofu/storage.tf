data "aws_caller_identity" "me" {}
locals {
  account = data.aws_caller_identity.me.account_id
  prefix  = "slidesdone-${var.env}"
}

# ── editor: the static single-page app, served by CloudFront only
resource "aws_s3_bucket" "editor" {
  bucket = "${local.prefix}-editor-${local.account}"
}
resource "aws_s3_bucket_public_access_block" "editor" {
  bucket                  = aws_s3_bucket.editor.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── assets: pictures people upload or generate, plus the nightly database backups and the deploy files
resource "aws_s3_bucket" "assets" {
  bucket = "${local.prefix}-assets-${local.account}"
}
resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    id     = "expire-db-backups"
    status = "Enabled"
    filter { prefix = "db-backups/" }
    expiration { days = 30 }
  }
  rule {
    id     = "abort-partial-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 2 }
  }
}

# ── CloudFront in front of the editor bucket (certificate needs delegation first)
resource "aws_cloudfront_origin_access_control" "editor" {
  name                              = "${local.prefix}-editor"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
resource "aws_cloudfront_distribution" "editor" {
  count               = var.use_cloudfront ? 1 : 0
  enabled             = true
  default_root_object = "index.html"
  aliases             = ["app.${var.domain}"]
  price_class         = "PriceClass_100"
  comment             = "SlidesDone ${var.env} editor"

  origin {
    domain_name              = aws_s3_bucket.editor.bucket_regional_domain_name
    origin_id                = "editor"
    origin_access_control_id = aws_cloudfront_origin_access_control.editor.id
  }
  default_cache_behavior {
    target_origin_id       = "editor"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # AWS managed: CachingOptimized
  }
  # a single-page app: any unknown path is the app itself
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.editor[0].certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
resource "aws_s3_bucket_policy" "editor" {
  count  = var.use_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.editor.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "CloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.editor.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.editor[0].arn } }
    }]
  })
}
