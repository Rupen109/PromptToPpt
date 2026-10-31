output "nameservers" {
  description = "Enter these 4 at the registrar (Nameservers -> custom), then set delegated = true"
  value       = aws_route53_zone.main.name_servers
}
output "server_ip" { value = aws_eip.server.public_ip }
output "server_instance_id" { value = aws_instance.server.id }
output "ecr_api" { value = aws_ecr_repository.api.repository_url }
output "ecr_web" { value = aws_ecr_repository.web.repository_url }
output "assets_bucket" { value = aws_s3_bucket.assets.bucket }
output "editor_bucket" { value = aws_s3_bucket.editor.bucket }
output "editor_distribution_id" { value = var.use_cloudfront ? aws_cloudfront_distribution.editor[0].id : null }
