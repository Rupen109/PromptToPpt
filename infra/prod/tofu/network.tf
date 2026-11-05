data "aws_caller_identity" "me" {}
data "aws_availability_zones" "up" { state = "available" }
data "aws_route53_zone" "main" { name = var.domain } # the zone itself is managed by infra/tofu (shared with mail records)

locals {
  account = data.aws_caller_identity.me.account_id
  prefix  = "slidesdone-${var.env}"
  azs     = slice(data.aws_availability_zones.up.names, 0, 2)
}

# Our own network: public subnets for the server (no NAT gateway: it costs $0.059 an hour), private subnets kept ready for RDS (Stage 2).
resource "aws_vpc" "main" {
  cidr_block           = "10.20.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.prefix }
}
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = local.prefix }
}
resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  map_public_ip_on_launch = false # the server gets its fixed address (Elastic IP) instead
  tags                    = { Name = "${local.prefix}-public-${count.index}" }
}
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, 10 + count.index)
  tags              = { Name = "${local.prefix}-private-${count.index}" }
}
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = { Name = "${local.prefix}-public" }
}
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Only CloudFront may reach the server: one rule from AWS's CloudFront origin-facing address list (it counts as 55 of the default 60 rules).
# No SSH: the server is reached through AWS Session Manager. No port 80: certificates come through the DNS challenge.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}
resource "aws_security_group" "server" {
  name_prefix = "${local.prefix}-server-"
  description = "SlidesDone origin: HTTPS from CloudFront only"
  vpc_id      = aws_vpc.main.id
  lifecycle { create_before_destroy = true }
}
resource "aws_vpc_security_group_ingress_rule" "https_from_cloudfront" {
  security_group_id = aws_security_group.server.id
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront.id
}
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.server.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
