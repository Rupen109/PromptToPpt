# CloudFront's origin name for the server. Not a public site: the server answers it with 403 (see infra/prod/server/Caddyfile).
resource "aws_route53_record" "origin" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = local.origin_host
  type    = "A"
  ttl     = 300
  records = [aws_eip.server.public_ip]
}

# The public names. Created only at cutover (var.cutover = true); they replace the records that point at the test server
# (allow_overwrite), after which infra/tofu stops managing those names (see docs/DEPLOY_AWS_PROD.md, cutover).
locals {
  public_names = var.cutover ? {
    apex = { name = var.domain, dist = aws_cloudfront_distribution.web }
    www  = { name = "www.${var.domain}", dist = aws_cloudfront_distribution.web }
    app  = { name = "app.${var.domain}", dist = aws_cloudfront_distribution.editor }
    api  = { name = "api.${var.domain}", dist = aws_cloudfront_distribution.api }
  } : {}
  public_records = merge({}, [for k, v in local.public_names : {
    "${k}-A"    = { name = v.name, type = "A", target = v.dist.domain_name, zone = v.dist.hosted_zone_id }
    "${k}-AAAA" = { name = v.name, type = "AAAA", target = v.dist.domain_name, zone = v.dist.hosted_zone_id }
  }]...)
}
resource "aws_route53_record" "public" {
  for_each        = local.public_records
  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  allow_overwrite = true
  alias {
    name                   = each.value.target
    zone_id                = each.value.zone
    evaluate_target_health = false
  }
}
