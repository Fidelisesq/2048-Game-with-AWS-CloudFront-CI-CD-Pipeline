variable "aws_region" {
  description = "AWS region for the regional application resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment; production enables deletion protection"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "environment must be development, staging, or production."
  }
}

variable "domain_name" {
  description = "Route 53 hosted-zone domain"
  type        = string
  default     = "fozdigitalz.com"
}

variable "subdomain" {
  description = "Game subdomain"
  type        = string
  default     = "play-2048"
}

variable "hosted_zone_id" {
  description = "Route 53 hosted-zone ID for the domain"
  type        = string
  sensitive   = true
}

variable "acm_certificate_arn" {
  description = "us-east-1 ACM certificate ARN covering the game hostname"
  type        = string
}

variable "enable_waf" {
  description = "Attach AWS WAF managed rules and an API rate limit to CloudFront"
  type        = bool
  default     = false
}

variable "waf_api_rate_limit" {
  description = "Maximum API requests per source IP in a five-minute WAF evaluation window"
  type        = number
  default     = 500
}

variable "log_retention_days" {
  description = "CloudWatch log retention"
  type        = number
  default     = 30
}

variable "access_log_retention_days" {
  description = "CloudFront access-log retention"
  type        = number
  default     = 90
}

variable "cloudfront_price_class" {
  description = "CloudFront edge-location price class"
  type        = string
  default     = "PriceClass_100"
}
