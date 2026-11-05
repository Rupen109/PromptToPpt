# CloudFront: the only way into SlidesDone. Three distributions (one per job), one certificate for all public names.
#   website  slidesdone.app + www  → the server (Next.js): static files cached a year, pages cached as the site's own Cache-Control says
#   editor   app.slidesdone.app    → the private S3 editor bucket (single-page app)
#   api      api.slidesdone.app    → the server (API): nothing cached except pictures (/api/v1/assets/*, public + immutable)
# Every request to the server carries X-Origin-Verify (EDGE_SHARED_SECRET from Parameter Store); Caddy refuses requests without it.
# The website and API forward the visitor's Host header plus CloudFront's viewer headers (IP, country): AWS's managed
# "AllViewerAndCloudFrontHeaders-2022-06" policy is the only one that passes CloudFront-Viewer-Address, and it includes Host.

locals {
  # AWS managed policies (ids read with `aws cloudfront list-cache-policies / list-origin-request-policies --type managed`, 2026-11-04)
  cache_optimized         = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  cache_disabled          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  cache_origin_headers    = "83da9c7e-98b4-4e11-a168-04f0df8e2c65" # UseOriginCacheControlHeaders
  cache_origin_headers_qs = "4cc15a8a-d715-48a4-82b8-cc0b614638fe" # UseOriginCacheControlHeaders-QueryStrings
  req_all_viewer_and_cf   = "33f36d7e-f396-46d9-90e0-52428a34d9dc" # Managed-AllViewerAndCloudFrontHeaders-2022-06
  req_host_only           = "bf0718e1-ba1e-49d1-88b1-f726733018ae" # Managed-HostHeaderOnly
  origin_host             = "origin.${var.domain}"
  all_methods             = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
  editor_headers          = jsondecode(file("${path.module}/generated/cloudfront-response-headers-policy.json"))
}

data "aws_ssm_parameter" "edge_secret" {
  name = "/prompttoppt/${var.env}/EDGE_SHARED_SECRET" # stored by infra/scripts/put-secrets.sh; the state bucket is encrypted and private
}

# ── one certificate (us-east-1, as CloudFront requires) for every public name, validated through Route 53
resource "aws_acm_certificate" "edge" {
  provider                  = aws.use1
  domain_name               = var.domain
  subject_alternative_names = ["www.${var.domain}", "app.${var.domain}", "api.${var.domain}"]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}
resource "aws_route53_record" "edge_cert" {
  for_each        = { for o in aws_acm_certificate.edge.domain_validation_options : o.domain_name => o }
  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  ttl             = 60
  records         = [each.value.resource_record_value]
  allow_overwrite = true
}
resource "aws_acm_certificate_validation" "edge" {
  provider                = aws.use1
  certificate_arn         = aws_acm_certificate.edge.arn
  validation_record_fqdns = [for r in aws_route53_record.edge_cert : r.fqdn]
}

# ── website
resource "aws_cloudfront_distribution" "web" {
  enabled         = true
  comment         = "${local.prefix} website"
  aliases         = [var.domain, "www.${var.domain}"]
  price_class     = "PriceClass_200" # includes India and the rest of Asia
  http_version    = "http2and3"
  is_ipv6_enabled = true

  origin {
    origin_id   = "server"
    domain_name = local.origin_host
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
    custom_header {
      name  = "X-Origin-Verify"
      value = data.aws_ssm_parameter.edge_secret.value
    }
  }
  default_cache_behavior {
    target_origin_id         = "server"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = local.all_methods
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = local.cache_origin_headers_qs # pages say themselves how long they may be cached (60 s for blog pages; private ones: not at all)
    origin_request_policy_id = local.req_all_viewer_and_cf
  }
  ordered_cache_behavior {
    path_pattern             = "/_next/static/*" # file names carry a content hash: cached for a long time
    target_origin_id         = "server"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = local.cache_optimized
    origin_request_policy_id = local.req_host_only
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.edge.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ── API
resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  comment         = "${local.prefix} api"
  aliases         = ["api.${var.domain}"]
  price_class     = "PriceClass_200"
  http_version    = "http2and3"
  is_ipv6_enabled = true

  origin {
    origin_id   = "server"
    domain_name = local.origin_host
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = var.origin_read_timeout # one AI call can take up to 60 s, a retry more; the live stream sends a heartbeat every 20 s
      origin_keepalive_timeout = 5
    }
    custom_header {
      name  = "X-Origin-Verify"
      value = data.aws_ssm_parameter.edge_secret.value
    }
  }
  default_cache_behavior {
    target_origin_id         = "server"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = local.all_methods
    cached_methods           = ["GET", "HEAD"]
    compress                 = false # Caddy compresses API answers itself; the live stream must not be held back
    cache_policy_id          = local.cache_disabled
    origin_request_policy_id = local.req_all_viewer_and_cf
  }
  ordered_cache_behavior {
    path_pattern             = "/api/v1/assets/*" # pictures: public, immutable, capability URLs
    target_origin_id         = "server"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = local.cache_origin_headers
    origin_request_policy_id = local.req_host_only
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.edge.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ── editor (static files in S3)
resource "aws_cloudfront_origin_access_control" "editor" {
  name                              = "${local.prefix}-editor"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# security headers for the editor, generated from scripts/csp.mjs (the same definition the website and local dev use)
resource "aws_cloudfront_response_headers_policy" "editor" {
  name    = "${local.prefix}-editor-security"
  comment = "generated by scripts/gen-security-headers.mjs"
  security_headers_config {
    content_security_policy {
      override                = true
      content_security_policy = local.editor_headers.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy
    }
    content_type_options { override = true }
    frame_options {
      override     = true
      frame_option = "DENY"
    }
    referrer_policy {
      override        = true
      referrer_policy = "strict-origin-when-cross-origin"
    }
    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
    }
  }
  custom_headers_config {
    dynamic "items" {
      for_each = local.editor_headers.CustomHeadersConfig.Items
      content {
        header   = items.value.Header
        value    = items.value.Value
        override = items.value.Override
      }
    }
  }
}

resource "aws_cloudfront_distribution" "editor" {
  enabled             = true
  comment             = "${local.prefix} editor"
  aliases             = ["app.${var.domain}"]
  price_class         = "PriceClass_200"
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  origin {
    origin_id                = "editor"
    domain_name              = aws_s3_bucket.b["editor"].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.editor.id
  }
  default_cache_behavior {
    target_origin_id           = "editor"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = local.cache_optimized # hashed files carry max-age=1 year; index.html is uploaded with no-cache and invalidated on deploy
    response_headers_policy_id = aws_cloudfront_response_headers_policy.editor.id
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
    acm_certificate_arn      = aws_acm_certificate_validation.edge.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
