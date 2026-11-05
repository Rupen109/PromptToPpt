# GitHub Actions deploys with a limited user (keys stored as GitHub secrets AWS_PROD_ACCESS_KEY_ID / AWS_PROD_SECRET_ACCESS_KEY).
# It can only deploy: push the images, publish the editor and the deploy files, refresh the editor's CDN copy, and start the deploy on this one server.
resource "aws_iam_user" "github_deploy" {
  name = "${local.prefix}-github-deploy"
}
resource "aws_iam_user_policy" "github_deploy" {
  name = "deploy"
  user = aws_iam_user.github_deploy.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken", "sts:GetCallerIdentity"], Resource = "*" },
      { Effect = "Allow", Action = ["ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:DescribeImages"], Resource = [for r in aws_ecr_repository.r : r.arn] },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = ["${aws_s3_bucket.b["assets"].arn}/deploy/*", "${aws_s3_bucket.b["editor"].arn}/*"] },
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = [aws_s3_bucket.b["assets"].arn, aws_s3_bucket.b["editor"].arn] },
      { Effect = "Allow", Action = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"], Resource = aws_cloudfront_distribution.editor.arn },
      { Effect = "Allow", Action = ["ssm:SendCommand"], Resource = ["arn:aws:ssm:${var.region}::document/AWS-RunShellScript", aws_instance.server.arn] },
      { Effect = "Allow", Action = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"], Resource = "*" },
      { Effect = "Allow", Action = ["ec2:DescribeInstances", "cloudfront:ListDistributions"], Resource = "*" },
    ]
  })
}
resource "aws_iam_access_key" "github_deploy" {
  user = aws_iam_user.github_deploy.name
}
