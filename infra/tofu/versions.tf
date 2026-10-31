terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

# Everything lives in Sydney: this Free-plan account is only allowed to create servers there.
provider "aws" {
  region  = var.region
  profile = var.aws_profile
}

# CloudFront certificates must be requested in us-east-1 (certificates are allowed there; servers are not).
provider "aws" {
  alias   = "use1"
  region  = "us-east-1"
  profile = var.aws_profile
}
