# Receiving: free forwarding (ImprovMX) turns support@ / hello@ / legal@ into a normal inbox of your choice (set up at improvmx.com).
resource "aws_route53_record" "mx" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 300
  records = ["10 mx1.improvmx.com", "20 mx2.improvmx.com"]
}
# The apex TXT record set. Route 53 keeps every TXT value of one name in ONE record set, so all apex TXT values live here.
#   SPF: who may send as @slidesdone.app (ImprovMX forwarding, Gmail "send as", Brevo for the app's own mail).
#   google-site-verification: proves ownership of the domain to Google Search Console (domain property). Removing it un-verifies the site.
resource "aws_route53_record" "spf" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 300
  records = [
    "v=spf1 include:spf.improvmx.com include:_spf.google.com include:spf.brevo.com ~all",
    "google-site-verification=_6OcL66spK7Ip3tVENon2PVhFV9m46FOkEV-17sBpCU",
  ]
}
resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 300
  records = ["v=DMARC1; p=none; rua=mailto:${var.dmarc_report_to}; fo=1"]
}
# Brevo's own verification and signature records are added from its dashboard values (see extra_dns_records).
resource "aws_route53_record" "extra" {
  for_each = var.extra_dns_records
  zone_id  = aws_route53_zone.main.zone_id
  name     = each.value.name == "" ? var.domain : "${each.value.name}.${var.domain}"
  type     = each.value.type
  ttl      = 300
  records  = each.value.records
}
