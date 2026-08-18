resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "2048-leaderboard-lambda-errors"
  alarm_description   = "Leaderboard Lambda returned errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.leaderboard_api.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "2048-leaderboard-lambda-throttles"
  alarm_description   = "Leaderboard Lambda was throttled"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.leaderboard_api.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "api_server_errors" {
  alarm_name          = "2048-leaderboard-api-5xx"
  alarm_description   = "Leaderboard API returned server errors"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ApiId = aws_apigatewayv2_api.leaderboard_api.id
    Stage = aws_apigatewayv2_stage.api_stage.name
  }
}

resource "aws_cloudwatch_metric_alarm" "dynamodb_throttles" {
  alarm_name          = "2048-leaderboard-dynamodb-throttles"
  alarm_description   = "Leaderboard DynamoDB requests were throttled"
  namespace           = "AWS/DynamoDB"
  metric_name         = "ThrottledRequests"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = aws_dynamodb_table.leaderboard.name
  }
}

resource "aws_cloudwatch_metric_alarm" "cloudfront_server_error_rate" {
  provider = aws.us_east_1

  alarm_name          = "2048-cloudfront-5xx-rate"
  alarm_description   = "CloudFront 5xx error rate exceeded one percent"
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  dimensions = {
    DistributionId = aws_cloudfront_distribution.game_distribution.id
    Region         = "Global"
  }
}
