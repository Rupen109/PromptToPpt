# GitHub Actions deploys without any stored AWS key: GitHub proves "this run is repo X, branch master" and AWS hands out a short-lived login.
variable "github_repo" {
  description = "owner/name of the repository allowed to deploy"
  type        = string
  default     = "Rupen109/PromptToPpt"
}
variable "github_branch" {
  type    = string
  default = "master"
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_deploy" {
  name = "${local.prefix}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repo}:ref:refs/heads/${var.github_branch}"
        }
      }
    }]
  })
  max_session_duration = 3600
}

# only what a deploy needs: push images, publish files, tell the server to restart
resource "aws_iam_role_policy" "github_deploy" {
  name = "deploy"
  role = aws_iam_role.github_deploy.id
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

output "github_deploy_role_arn" { value = aws_iam_role.github_deploy.arn }
