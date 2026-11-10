data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

# ── what the server may do: be managed by Session Manager, read its own secrets, use its buckets, pull its images, prove domain ownership for HTTPS
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
      { Sid = "Secrets", Effect = "Allow", Action = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"], Resource = "arn:aws:ssm:${var.region}:${local.account}:parameter/prompttoppt/${var.env}/*" },
      { Sid = "Assets", Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.b["assets"].arn}/*" },
      # backups: write and read, never delete (expiry is the bucket's own rule), so a compromised server cannot erase its own backups
      { Sid = "Backups", Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"], Resource = "${aws_s3_bucket.b["backups"].arn}/*" },
      { Sid = "List", Effect = "Allow", Action = ["s3:ListBucket", "s3:ListBucketMultipartUploads"], Resource = [aws_s3_bucket.b["assets"].arn, aws_s3_bucket.b["backups"].arn] },
      { Sid = "EcrLogin", Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      { Sid = "EcrPull", Effect = "Allow", Action = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"], Resource = [for r in aws_ecr_repository.r : r.arn] },
      # Caddy's DNS challenge: only TXT records named _acme-challenge.* in our zone (caddy-dns/route53 README, restricted policy)
      { Sid = "AcmeZones", Effect = "Allow", Action = ["route53:ListHostedZonesByName", "route53:ListHostedZones"], Resource = "*" },
      { Sid = "AcmeRead", Effect = "Allow", Action = ["route53:ListResourceRecordSets"], Resource = data.aws_route53_zone.main.arn },
      { Sid = "AcmeChange", Effect = "Allow", Action = ["route53:GetChange"], Resource = "arn:aws:route53:::change/*" },
      {
        Sid = "AcmeWrite", Effect = "Allow", Action = ["route53:ChangeResourceRecordSets"], Resource = data.aws_route53_zone.main.arn,
        Condition = {
          "ForAllValues:StringEquals" = { "route53:ChangeResourceRecordSetsRecordTypes" = ["TXT"] }
          "ForAllValues:StringLike"   = { "route53:ChangeResourceRecordSetsNormalizedRecordNames" = ["_acme-challenge.*"] }
        }
      },
    ]
  })
}
resource "aws_iam_instance_profile" "server" {
  name_prefix = "${local.prefix}-server-"
  role        = aws_iam_role.server.name
}

# ── the server: disposable (rebuilt from code); everything that matters is on the data disk, in S3 or in Parameter Store
resource "aws_instance" "server" {
  ami                    = data.aws_ssm_parameter.ami.value
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.server.id]
  iam_instance_profile   = aws_iam_instance_profile.server.name
  user_data = templatefile("${path.module}/user-data.sh.tftpl", {
    env            = var.env, region = var.region, domain = var.domain, app_env = var.app_env, acme_email = var.alert_email,
    hosted_zone_id = data.aws_route53_zone.main.zone_id, assets_bucket = aws_s3_bucket.b["assets"].bucket, backups_bucket = aws_s3_bucket.b["backups"].bucket,
    data_volume_id = aws_ebs_volume.data.id,
  })

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 2 # containers (Caddy, WAL-G, the API's S3 client) use the server's role too
  }
  credit_specification {
    cpu_credits = "standard" # never charged for a busy CPU (it slows to its baseline instead; an alarm warns first)
  }
  tags = { Name = "${local.prefix}-server" }
  lifecycle { ignore_changes = [ami, user_data] }
}

# Postgres lives here. It survives the server: a replaced server attaches the same disk. Deleting it needs this line removed first.
resource "aws_ebs_volume" "data" {
  availability_zone = local.azs[0]
  size              = var.data_volume_gb
  type              = "gp3"
  encrypted         = true
  tags              = { Name = "${local.prefix}-data", Snapshot = "daily" }
  lifecycle { prevent_destroy = true }
}
resource "aws_volume_attachment" "data" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data.id
  instance_id = aws_instance.server.id
}

resource "aws_eip" "server" {
  domain = "vpc"
  tags   = { Name = "${local.prefix}-server" }
}
resource "aws_eip_association" "server" {
  instance_id   = aws_instance.server.id
  allocation_id = aws_eip.server.id
}

# ── snapshots of the data disk twice a day (02:00 and 12:30 India time), 7 of each kept (a second safety net next to the WAL backups)
resource "aws_iam_role" "dlm" {
  name_prefix = "${local.prefix}-dlm-"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "dlm.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy_attachment" "dlm" {
  role       = aws_iam_role.dlm.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}
resource "aws_dlm_lifecycle_policy" "data" {
  description        = "${local.prefix} data disk, daily"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"
  policy_details {
    resource_types = ["VOLUME"]
    target_tags    = { Snapshot = "daily" }
    # UTC times; India is UTC+5:30: 20:30 UTC = 02:00, 07:00 UTC = 12:30
    dynamic "schedule" {
      for_each = { night = "20:30", noon = "07:00" }
      content {
        name = schedule.key
        create_rule {
          interval      = 24
          interval_unit = "HOURS"
          times         = [schedule.value]
        }
        retain_rule { count = 7 }
        copy_tags = true
      }
    }
  }
}
