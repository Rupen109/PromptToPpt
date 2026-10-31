# GitHub Actions deploys with a limited user whose key is stored as a GitHub secret (this Free-plan account cannot create the passwordless OIDC login).
# The user can only deploy: push the two images, publish files to the two buckets, restart this one server, and look it up. Nothing else.
resource "aws_iam_user" "github_deploy" {
  name = "${local.prefix}-github-deploy"
}

resource "aws_iam_user_policy" "github_deploy" {
  name = "deploy"
  user = aws_iam_user.github_deploy.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"], Resource = [aws_ecr_repository.api.arn, aws_ecr_repository.web.arn] },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = ["${aws_s3_bucket.assets.arn}/deploy/*", "${aws_s3_bucket.editor.arn}/*"] },
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = [aws_s3_bucket.assets.arn, aws_s3_bucket.editor.arn] },
      { Effect = "Allow", Action = ["ssm:SendCommand"], Resource = ["arn:aws:ssm:${var.region}::document/AWS-RunShellScript", aws_instance.server.arn] },
      { Effect = "Allow", Action = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"], Resource = "*" },
      { Effect = "Allow", Action = ["ec2:DescribeInstances"], Resource = "*" },
    ]
  })
}

resource "aws_iam_access_key" "github_deploy" {
  user = aws_iam_user.github_deploy.name
}

# read them without printing:  tofu output -raw github_deploy_access_key_id | pbcopy   (then the secret one the same way)
output "github_deploy_access_key_id" {
  value     = aws_iam_access_key.github_deploy.id
  sensitive = true
}
output "github_deploy_secret_access_key" {
  value     = aws_iam_access_key.github_deploy.secret
  sensitive = true
}
