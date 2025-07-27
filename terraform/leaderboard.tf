# DynamoDB Table for Leaderboard
resource "aws_dynamodb_table" "leaderboard" {
  name           = "2048-leaderboard"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "score"
    type = "N"
  }

  global_secondary_index {
    name     = "ScoreIndex"
    hash_key = "game_type"
    range_key = "score"
    projection_type = "ALL"
  }

  attribute {
    name = "game_type"
    type = "S"
  }
}

# Lambda function for leaderboard API
resource "aws_lambda_function" "leaderboard_api" {
  filename         = "leaderboard.zip"
  function_name    = "2048-leaderboard-api"
  role            = aws_iam_role.lambda_role.arn
  handler         = "index.handler"
  runtime         = "nodejs20.x"
  timeout         = 10
  source_code_hash = data.archive_file.leaderboard_zip.output_base64sha256

  depends_on = [data.archive_file.leaderboard_zip]
}

# Create Lambda deployment package
data "archive_file" "leaderboard_zip" {
  type        = "zip"
  output_path = "leaderboard.zip"
  source_dir  = "${path.module}/lambda"
  excludes    = ["leaderboard.js"]
  
  depends_on = [null_resource.lambda_dependencies]
}

# Install npm dependencies for Lambda
resource "null_resource" "lambda_dependencies" {
  provisioner "local-exec" {
    command = "cd lambda && npm install --production"
  }
  
  triggers = {
    package_json = filemd5("${path.module}/lambda/package.json")
    index_js = filemd5("${path.module}/lambda/index.js")
  }
}

# IAM role for Lambda
resource "aws_iam_role" "lambda_role" {
  name = "2048-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# IAM policy for Lambda to access DynamoDB
resource "aws_iam_role_policy" "lambda_dynamodb_policy" {
  name = "lambda-dynamodb-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.leaderboard.arn,
          "${aws_dynamodb_table.leaderboard.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# API Gateway
resource "aws_apigatewayv2_api" "leaderboard_api" {
  name          = "2048-leaderboard-api"
  protocol_type = "HTTP"
  
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["content-type"]
  }
}

# API Gateway Integration
resource "aws_apigatewayv2_integration" "leaderboard_integration" {
  api_id           = aws_apigatewayv2_api.leaderboard_api.id
  integration_type = "AWS_PROXY"
  integration_uri  = aws_lambda_function.leaderboard_api.invoke_arn
}

# API Gateway Routes
resource "aws_apigatewayv2_route" "get_leaderboard" {
  api_id    = aws_apigatewayv2_api.leaderboard_api.id
  route_key = "GET /leaderboard"
  target    = "integrations/${aws_apigatewayv2_integration.leaderboard_integration.id}"
}

resource "aws_apigatewayv2_route" "post_score" {
  api_id    = aws_apigatewayv2_api.leaderboard_api.id
  route_key = "POST /score"
  target    = "integrations/${aws_apigatewayv2_integration.leaderboard_integration.id}"
}

# API Gateway Stage with throttling
resource "aws_apigatewayv2_stage" "api_stage" {
  api_id      = aws_apigatewayv2_api.leaderboard_api.id
  name        = "prod"
  auto_deploy = true
  
  throttle_settings {
    rate_limit  = 100
    burst_limit = 200
  }
  
  route_settings {
    route_key = "POST /score"
    throttling_rate_limit  = 10
    throttling_burst_limit = 20
  }
}

# Lambda permission for API Gateway
resource "aws_lambda_permission" "api_gateway_lambda" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.leaderboard_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.leaderboard_api.execution_arn}/*/*"
}