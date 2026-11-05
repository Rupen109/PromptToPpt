terraform {
  required_version = ">= 1.10" # S3 state locking with use_lockfile
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  # State lives in S3 (versioned, encrypted, locked), not on one laptop. The bucket is made once by infra/prod/bootstrap-state.sh.
  backend "s3" {
    bucket       = "slidesdone-tfstate-461415799262"
    key          = "prod/terraform.tfstate"
    region       = "ap-southeast-2"
    profile      = "goldenhour"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile
  default_tags { tags = { Project = "slidesdone", Env = var.env } }
}

# CloudFront certificates must be requested in us-east-1.
provider "aws" {
  alias   = "use1"
  region  = "us-east-1"
  profile = var.aws_profile
  default_tags { tags = { Project = "slidesdone", Env = var.env } }
}
