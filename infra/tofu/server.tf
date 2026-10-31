data "aws_vpc" "default" {
  default = true
}
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}
data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

# Only the web ports are open. There is no SSH: you reach the server through AWS Session Manager (no key, no open port).
resource "aws_security_group" "server" {
  name_prefix = "${local.prefix}-server-"
  description = "SlidesDone web server: HTTP and HTTPS only"
  vpc_id      = data.aws_vpc.default.id
  lifecycle { create_before_destroy = true }
}
resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.server.id
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}
resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.server.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}
resource "aws_vpc_security_group_ingress_rule" "https_quic" {
  security_group_id = aws_security_group.server.id
  ip_protocol       = "udp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.server.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# ── what the server may do: be managed by Session Manager, read its own secrets, use the assets bucket, pull its images
resource "aws_iam_role" "server" {
  name_prefix = "${local.prefix}-server-"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.server.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}
resource "aws_iam_role_policy" "server" {
  role = aws_iam_role.server.id
  name = "slidesdone-server"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"], Resource = "arn:aws:ssm:${var.region}:${local.account}:parameter/prompttoppt/${var.env}/*" },
      { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.assets.arn}/*" },
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = [aws_s3_bucket.assets.arn, aws_s3_bucket.editor.arn] },
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.editor.arn}/*" },
      { Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      { Effect = "Allow", Action = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"], Resource = [aws_ecr_repository.api.arn, aws_ecr_repository.web.arn] },
    ]
  })
}
resource "aws_iam_instance_profile" "server" {
  name_prefix = "${local.prefix}-server-"
  role        = aws_iam_role.server.name
}

resource "aws_ecr_repository" "api" {
  name                 = "${local.prefix}/api"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}
resource "aws_ecr_repository" "web" {
  name                 = "${local.prefix}/web"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}
resource "aws_ecr_lifecycle_policy" "keep_few" {
  for_each   = { api = aws_ecr_repository.api.name, web = aws_ecr_repository.web.name }
  repository = each.value
  policy = jsonencode({
    rules = [{ rulePriority = 1, description = "keep the last 5 images", selection = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }, action = { type = "expire" } }]
  })
}

resource "aws_instance" "server" {
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnets.default.ids[0]
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.server.name
  user_data              = templatefile("${path.module}/user-data.sh.tftpl", { env = var.env, region = var.region, assets_bucket = aws_s3_bucket.assets.bucket })

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2 # containers read the server's credentials too
  }
  credit_specification {
    cpu_credits = "standard" # never charged extra for a busy CPU
  }
  tags = { Name = "${local.prefix}-server" }
  lifecycle { ignore_changes = [ami, user_data] }
}

resource "aws_eip" "server" {
  domain = "vpc"
  tags   = { Name = "${local.prefix}-server" }
}
resource "aws_eip_association" "server" {
  instance_id   = aws_instance.server.id
  allocation_id = aws_eip.server.id
}
