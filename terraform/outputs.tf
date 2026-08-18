output "website_url" {
  description = "Canonical game URL"
  value       = "https://${var.subdomain}.${var.domain_name}"
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.game_distribution.id
}

output "s3_bucket_name" {
  description = "Private S3 content bucket"
  value       = aws_s3_bucket.game_bucket.bucket
}

output "api_gateway_url" {
  description = "Direct API Gateway stage URL, primarily for diagnostics"
  value       = "${aws_apigatewayv2_api.leaderboard_api.api_endpoint}/${aws_apigatewayv2_stage.api_stage.name}"
}

output "public_api_base_path" {
  description = "Same-origin API base path used by the browser"
  value       = "/api"
}

output "waf_enabled" {
  description = "Whether CloudFront WAF protection is enabled"
  value       = var.enable_waf
}
