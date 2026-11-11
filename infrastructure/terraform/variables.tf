variable "env" {
  type    = string
  default = "staging"
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "domain" {
  description = "e.g. coopswap.example.com. leave empty to use the cloudfront domain"
  type        = string
  default     = ""
}

variable "api_image" {
  description = "full image ref for the api, set by the deploy workflow"
  type        = string
  default     = ""
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "github_repo" {
  description = "owner/name, allowed to assume the deploy role via oidc"
  type        = string
}

variable "smtp_url_secret_arn" {
  description = "arn of a secrets manager secret holding SMTP_URL (e.g. SES smtp creds). optional"
  type        = string
  default     = ""
}
