output "server_instance_id" { value = aws_instance.server.id }
output "server_ip" { value = aws_eip.server.public_ip }
output "assets_bucket" { value = aws_s3_bucket.b["assets"].bucket }
output "backups_bucket" { value = aws_s3_bucket.b["backups"].bucket }
output "editor_bucket" { value = aws_s3_bucket.b["editor"].bucket }
output "editor_distribution_id" { value = aws_cloudfront_distribution.editor.id }
output "ecr" { value = { for k, r in aws_ecr_repository.r : k => r.repository_url } }
output "cloudfront_domains" {
  description = "For testing before cutover, e.g.  curl --resolve slidesdone.app:443:$(dig +short <web domain> | head -1) https://slidesdone.app/"
  value       = { web = aws_cloudfront_distribution.web.domain_name, editor = aws_cloudfront_distribution.editor.domain_name, api = aws_cloudfront_distribution.api.domain_name }
}
# read without printing:  tofu output -raw github_deploy_access_key_id | pbcopy   (then the secret the same way)
output "github_deploy_access_key_id" {
  value     = aws_iam_access_key.github_deploy.id
  sensitive = true
}
output "github_deploy_secret_access_key" {
  value     = aws_iam_access_key.github_deploy.secret
  sensitive = true
}
