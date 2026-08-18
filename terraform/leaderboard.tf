locals {
  site_origin = "https://${var.subdomain}.${var.domain_name}"
}

resource "aws_dynamodb_table" "leaderboard" {
  name                        = "2048-leaderboard"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "id"
  deletion_protection_enabled = var.environment == "production"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "score"
    type = "N"
  }

  attribute {
    name = "game_type"
    type = "S"
  }

  global_secondary_index {
    name            = "ScoreIndex"
    hash_key        = "game_type"
    range_key       = "score"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_cloudwatch_log_group" "leaderboard_lambda" {
  name              = "/aws/lambda/2048-leaderboard-api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "leaderboard_api" {
  name              = "/aws/apigateway/2048-leaderboard-api"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role" "lambda_role" {
  name = "2048-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "2048-leaderboard-least-privilege"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "WriteAndQueryLeaderboard"
        Effect = "Allow"
        Action = ["dynamodb:PutItem", "dynamodb:Query"]
        Resource = [
          aws_dynamodb_table.leaderboard.arn,
          "${aws_dynamodb_table.leaderboard.arn}/index/ScoreIndex"
        ]
      },
      {
        Sid      = "WriteApplicationLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.leaderboard_lambda.arn}:*"
      },
      {
        Sid      = "PublishXRayTraces"
        Effect   = "Allow"
        Action   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
        Resource = "*"
      }
    ]
  })
}

data "archive_file" "leaderboard_zip" {
  type        = "zip"
  output_path = "${path.module}/leaderboard.zip"
  source_dir  = "${path.module}/lambda"
}

resource "aws_lambda_function" "leaderboard_api" {
  filename                       = data.archive_file.leaderboard_zip.output_path
  function_name                  = "2048-leaderboard-api"
  role                           = aws_iam_role.lambda_role.arn
  handler                        = "index.handler"
  runtime                        = "nodejs22.x"
  architectures                  = ["arm64"]
  memory_size                    = 128
  timeout                        = 5
  reserved_concurrent_executions = var.lambda_reserved_concurrency
  source_code_hash               = data.archive_file.leaderboard_zip.output_base64sha256

  environment {
    variables = {
      ALLOWED_ORIGIN   = local.site_origin
      GAME_TYPE        = "classic"
      SCORE_INDEX_NAME = "ScoreIndex"
      TABLE_NAME       = aws_dynamodb_table.leaderboard.name
    }
  }

  tracing_config {
    mode = "Active"
  }

  depends_on = [
    aws_cloudwatch_log_group.leaderboard_lambda,
    aws_iam_role_policy.lambda_policy
  ]
}

resource "aws_apigatewayv2_api" "leaderboard_api" {
  name          = "2048-leaderboard-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = [local.site_origin]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type", "idempotency-key"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "leaderboard" {
  api_id                 = aws_apigatewayv2_api.leaderboard_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.leaderboard_api.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 5000
}

resource "aws_apigatewayv2_route" "get_leaderboard" {
  api_id    = aws_apigatewayv2_api.leaderboard_api.id
  route_key = "GET /api/leaderboard"
  target    = "integrations/${aws_apigatewayv2_integration.leaderboard.id}"
}

resource "aws_apigatewayv2_route" "post_score" {
  api_id    = aws_apigatewayv2_api.leaderboard_api.id
  route_key = "POST /api/score"
  target    = "integrations/${aws_apigatewayv2_integration.leaderboard.id}"
}

resource "aws_apigatewayv2_stage" "api_stage" {
  api_id      = aws_apigatewayv2_api.leaderboard_api.id
  name        = "prod"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.leaderboard_api.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      ip               = "$context.identity.sourceIp"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      protocol         = "$context.protocol"
      responseLength   = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }

  default_route_settings {
    detailed_metrics_enabled = true
    throttling_rate_limit    = 50
    throttling_burst_limit   = 100
  }

  route_settings {
    route_key                = aws_apigatewayv2_route.post_score.route_key
    detailed_metrics_enabled = true
    throttling_rate_limit    = 5
    throttling_burst_limit   = 10
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.leaderboard_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.leaderboard_api.execution_arn}/*/*"
}

moved {
  from = aws_apigatewayv2_integration.leaderboard_integration
  to   = aws_apigatewayv2_integration.leaderboard
}

moved {
  from = aws_lambda_permission.api_gateway_lambda
  to   = aws_lambda_permission.api_gateway
}
