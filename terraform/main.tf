terraform {
  required_version = ">= 1.10.0"

  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.62"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket       = "foz-terraform-state-bucket"
    key          = "2048-game-s3/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Application = "2048-game"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Application = "2048-game"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "game_bucket" {
  bucket        = "2048-game-${random_id.bucket_suffix.hex}"
  force_destroy = var.environment != "production"
}

resource "aws_s3_bucket_versioning" "game_bucket" {
  bucket = aws_s3_bucket.game_bucket.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "game_bucket" {
  bucket = aws_s3_bucket.game_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "game_bucket" {
  bucket = aws_s3_bucket.game_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "game_bucket" {
  name                              = "2048-game-s3-oac"
  description                       = "Private access from the 2048 CloudFront distribution"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_s3_bucket_policy" "game_bucket" {
  bucket = aws_s3_bucket.game_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontReadOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.game_bucket.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.game_distribution.arn
        }
      }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.game_bucket]
}

resource "aws_s3_bucket" "access_logs" {
  bucket        = "2048-access-logs-${random_id.bucket_suffix.hex}"
  force_destroy = var.environment != "production"
}

resource "aws_s3_bucket_ownership_controls" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_acl" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  acl    = "log-delivery-write"

  depends_on = [aws_s3_bucket_ownership_controls.access_logs]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = var.access_log_retention_days
    }
  }
}

resource "aws_cloudfront_response_headers_policy" "security" {
  name = "2048-security-headers"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; base-uri 'self'; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https://www.google-analytics.com; manifest-src 'self'; object-src 'none'; script-src 'self' https://www.googletagmanager.com; style-src 'self'; worker-src 'self'; upgrade-insecure-requests"
      override                = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 63072000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
      override = true
    }
  }
}

resource "aws_wafv2_web_acl" "game" {
  count = var.enable_waf ? 1 : 0

  provider = aws.us_east_1

  name  = "2048-game-web-acl"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 10

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "2048CommonRules"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "2048KnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "ApiRateLimit"
    priority = 30

    action {
      block {}
    }

    statement {
      rate_based_statement {
        aggregate_key_type = "IP"
        limit              = var.waf_api_rate_limit

        scope_down_statement {
          byte_match_statement {
            positional_constraint = "STARTS_WITH"
            search_string         = "/api/"

            field_to_match {
              uri_path {}
            }

            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "2048ApiRateLimit"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "2048GameWebAcl"
    sampled_requests_enabled   = true
  }
}

resource "aws_cloudfront_distribution" "game_distribution" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = ["${var.subdomain}.${var.domain_name}"]
  price_class         = var.cloudfront_price_class
  web_acl_id          = var.enable_waf ? aws_wafv2_web_acl.game[0].arn : null
  wait_for_deployment = false

  lifecycle {
    create_before_destroy = true
  }

  origin {
    domain_name              = aws_s3_bucket.game_bucket.bucket_regional_domain_name
    origin_id                = "game-s3-origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.game_bucket.id
  }

  origin {
    domain_name = replace(aws_apigatewayv2_api.leaderboard_api.api_endpoint, "https://", "")
    origin_id   = "leaderboard-api-origin"
    origin_path = "/${aws_apigatewayv2_stage.api_stage.name}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    target_origin_id           = "game-s3-origin"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    allowed_methods            = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    target_origin_id           = "leaderboard-api-origin"
    viewer_protocol_policy     = "https-only"
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 10
  }

  logging_config {
    bucket          = aws_s3_bucket.access_logs.bucket_domain_name
    include_cookies = false
    prefix          = "cloudfront/"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = var.acm_certificate_arn
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
    cloudfront_default_certificate = false
  }

  depends_on = [aws_s3_bucket_acl.access_logs]
}

resource "aws_route53_record" "game_domain_ipv4" {
  zone_id = var.hosted_zone_id
  name    = "${var.subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.game_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.game_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "game_domain_ipv6" {
  zone_id = var.hosted_zone_id
  name    = "${var.subdomain}.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.game_distribution.domain_name
    zone_id                = aws_cloudfront_distribution.game_distribution.hosted_zone_id
    evaluate_target_health = false
  }
}

import {
  to = aws_route53_record.game_domain_ipv4
  id = "Z053615514X9UZZVP030H_2048.fozdigitalz.com_A"
}

import {
  to = aws_route53_record.game_domain_ipv6
  id = "Z053615514X9UZZVP030H_2048.fozdigitalz.com_AAAA"
}

moved {
  from = aws_route53_record.game_domain
  to   = aws_route53_record.game_domain_ipv4
}
