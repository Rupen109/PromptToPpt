variable "domain" {
  type    = string
  default = "slidesdone.app"
}
variable "env" {
  description = "Environment name; also the Parameter Store prefix /prompttoppt/<env>/"
  type        = string
  default     = "prod"
}
variable "region" {
  type    = string
  default = "ap-southeast-2" # Sydney: the only Region this account can use (AWS fixes it from the contact country for accounts made with the "new" sign-up)
}
variable "aws_profile" {
  type    = string
  default = "goldenhour"
}
variable "instance_type" {
  description = "t4g.small = 2 GB, ARM (free for 750 h a month until 2026-12-31). Next step up: t4g.medium (see docs/AWS_ARCHITECTURE.md, scale triggers)."
  type        = string
  default     = "t4g.small"
}
variable "data_volume_gb" {
  description = "Postgres disk. It can only grow (resize in place, then grow the filesystem)."
  type        = number
  default     = 20
}
variable "app_env" {
  description = "APP_ENV of the app: staging until the public launch (test payment keys), then production"
  type        = string
  default     = "staging"
  validation {
    condition     = contains(["staging", "production"], var.app_env)
    error_message = "app_env must be staging or production."
  }
}
variable "alert_email" {
  description = "Receives alarm e-mails (confirm the subscription e-mail AWS sends once)"
  type        = string
  default     = "rupenbhimani109@gmail.com"
}
variable "origin_read_timeout" {
  description = "Seconds CloudFront waits for the API's answer. This account's quota 'Response timeout per origin' (L-AECE9FA7) is 120 (read 2026-11-04); more needs a quota increase."
  type        = number
  default     = 120
}
variable "cutover" {
  description = "false: the new stack is built and reachable on its *.cloudfront.net addresses only. true: slidesdone.app, www, app and api point at it (see docs/DEPLOY_AWS_PROD.md)."
  type        = bool
  default     = false
}
variable "backup_retention_days" {
  description = "How long base backups and WAL are kept (point-in-time restore window)"
  type        = number
  default     = 14
}
