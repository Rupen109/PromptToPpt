variable "domain" {
  type    = string
  default = "slidesdone.app"
}
variable "site_prefix" {
  description = "empty = this server is THE site (slidesdone.app, www, app., api.; decided 2026-11-24: one server, testing on the owner's machine). A prefix (e.g. \"qa\") would give <prefix>.<domain> addresses instead."
  default     = ""
}
variable "env" {
  description = "Environment name; also the Parameter Store prefix /prompttoppt/<env>/"
  type        = string
  default     = "test"
}
variable "region" {
  type    = string
  default = "ap-southeast-2"
}
variable "aws_profile" {
  type    = string
  default = "goldenhour"
}
variable "instance_type" {
  description = "t4g.small = 2 GB, ARM (images are built for arm64). 1 GB (t4g.micro) is too small for the live site: reading uploaded files alone needs about 1 GB."
  type        = string
  default     = "t4g.small"
}
variable "use_cloudfront" {
  description = "Serve the editor from CloudFront. AWS must first verify the account (support case); until then the server serves the editor itself."
  type        = bool
  default     = false
}
variable "delegated" {
  description = "Set to true AFTER the 4 Route 53 nameservers are entered at the registrar. Certificates can only be validated once the domain points at Route 53."
  type        = bool
  default     = true # the registrar points at Route 53 since 2026-10-31
}
variable "dmarc_report_to" {
  description = "Where mail providers send summaries about who sends as the domain"
  type        = string
  default     = "blackcodes109@gmail.com"
}
variable "extra_dns_records" {
  description = "Extra records, e.g. Brevo's brevo-code TXT and DKIM CNAMEs: { key = { name = \"brevo1._domainkey\", type = \"CNAME\", records = [\"...\"] } }"
  type        = map(object({ name = string, type = string, records = list(string) }))
  default     = {}
}
