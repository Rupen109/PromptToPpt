resource "aws_route53_zone" "main" {
  name    = var.domain
  comment = "SlidesDone ${var.env}"
}

# website and API run on the server (Caddy gets its own HTTPS certificates); the editor is on CloudFront.
resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "A"
  ttl     = 300
  records = [aws_eip.server.public_ip]
}
resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "www.${var.domain}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.server.public_ip]
}
resource "aws_route53_record" "api" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "api.${var.domain}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.server.public_ip]
}

resource "aws_route53_record" "app_server" {
  count   = var.use_cloudfront ? 0 : 1
  zone_id = aws_route53_zone.main.zone_id
  name    = "app.${var.domain}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.server.public_ip]
}
resource "aws_route53_record" "app" {
  count   = var.use_cloudfront ? 1 : 0
  zone_id = aws_route53_zone.main.zone_id
  name    = "app.${var.domain}"
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.editor[0].domain_name
    zone_id                = aws_cloudfront_distribution.editor[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# ── certificate for the editor's CloudFront address (needs the domain to be delegated first)
resource "aws_acm_certificate" "editor" {
  count             = var.use_cloudfront ? 1 : 0
  provider          = aws.use1
  domain_name       = "app.${var.domain}"
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}
resource "aws_route53_record" "editor_cert" {
  for_each = var.use_cloudfront ? { for o in aws_acm_certificate.editor[0].domain_validation_options : o.domain_name => o } : {}
  zone_id  = aws_route53_zone.main.zone_id
  name     = each.value.resource_record_name
  type     = each.value.resource_record_type
  ttl      = 60
  records  = [each.value.resource_record_value]
}
resource "aws_acm_certificate_validation" "editor" {
  count                   = var.use_cloudfront ? 1 : 0
  provider                = aws.use1
  certificate_arn         = aws_acm_certificate.editor[0].arn
  validation_record_fqdns = [for r in aws_route53_record.editor_cert : r.fqdn]
}
