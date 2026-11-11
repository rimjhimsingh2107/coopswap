terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.70" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # state lives in s3 once you've created the bucket; see README.md
  # backend "s3" {}
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { project = "coopswap", env = var.env }
  }
}

# cloudfront certs have to live in us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}
