# Operations guide

## Request flow

CloudFront is the only public application entry point. Its default behavior permits only `GET`, `HEAD`, and `OPTIONS` and reads the private S3 origin with signed Origin Access Control requests. `/api/*` is forwarded over HTTPS to the `prod` API Gateway stage. API Gateway exposes only `GET /api/leaderboard` and `POST /api/score`; Lambda queries or writes the DynamoDB table.

The old S3 website endpoint is removed by Terraform. No public bucket policy remains.

## First migration

Install the Lambda packages before planning because the archive data source packages that directory:

```bash
npm ci --omit=dev --prefix terraform/lambda
terraform -chdir=terraform init
terraform -chdir=terraform plan
```

Review the plan for these expected changes:

- S3 website hosting and public access are removed.
- CloudFront changes to the regional S3 origin with OAC and gains an API origin.
- Lambda@Edge security-header resources are removed; a native CloudFront response-headers policy replaces them.
- API routes move beneath `/api`, CORS becomes exact-origin, and API/Lambda settings are hardened.
- DynamoDB enables point-in-time recovery and deletion protection.
- Logs and alarms are added.

Terraform `moved` blocks preserve the existing IPv4 Route 53 record, API integration, and Lambda permission addresses. Still review the plan rather than applying automatically from a workstation.

## GitHub OIDC

The deployment workflow assumes `arn:aws:iam::211125602758:role/github-platform-actions-oidc`. Long-lived `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` secrets are no longer read.

An environment-scoped trust condition should be limited to:

```text
token.actions.githubusercontent.com:aud = sts.amazonaws.com
token.actions.githubusercontent.com:sub = repo:Fidelisesq/2048-Game:environment:production
```

The workflow needs `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` for its state path (including the native `.tflock` file when enabled), plus permissions for the Terraform-managed S3, CloudFront, WAF, Route 53, API Gateway, Lambda, DynamoDB, IAM, CloudWatch Logs, X-Ray, and CloudWatch alarm resources. Keep the role scoped to this repository and environment.

## Runtime controls

| Control | Default | Purpose |
|---|---:|---|
| API Gateway POST rate | 5 requests/second | Limits ordinary write traffic |
| API Gateway POST burst | 10 | Absorbs brief legitimate bursts |
| Lambda reserved concurrency | 10 | Caps backend concurrency and cost |
| Lambda timeout | 5 seconds | Fails stalled requests quickly |
| Player name | 20 normalized characters | Restricts abuse and display issues |
| Maximum score | 100,000,000 | Rejects unreasonable writes |
| Request body | 2 KiB | Rejects oversized submissions |
| CloudWatch log retention | 30 days | Bounds log storage |
| CloudFront access-log retention | 90 days | Supports investigations |
| WAF | Disabled by default | Enables managed rules and a 500-request/5-minute IP limit when selected |

WAF is optional because it introduces a recurring charge. Set the GitHub variable `ENABLE_WAF=true` when the protection justifies the cost.

## Monitoring

Terraform creates alarms for Lambda errors, Lambda throttles, API 5xx responses, DynamoDB throttling, and CloudFront 5xx error rate. They intentionally have no notification destination until an operational email or incident channel is selected. Add alarm actions before treating them as paging controls.

Application logs are structured JSON and avoid logging request bodies or player names. API access logs capture request metadata and integration failures.

## Content releases and rollback

HTML, JavaScript, and service-worker files use `no-cache`; CSS, SVG, and the manifest use a one-day cache. CloudFront invalidates entry files after each release. S3 versioning makes object rollback possible:

1. Identify the previous object version.
2. Copy that version to become the current version.
3. Invalidate the affected CloudFront path.

Infrastructure rollback should use a reviewed Git revert and a new Terraform plan. Do not edit Terraform-managed resources in the console except during an incident, and import or reconcile any emergency change afterward.

## Privacy and frontend behavior

Game state, preferences, high score, and an optional player name are stored locally in the browser. A submitted name, score, and timestamp are public leaderboard data. Google Analytics loads only after explicit consent and honors browser Do Not Track. No advertising signals are enabled.

The game supports keyboard and touch input, responsive layouts, reduced-motion preferences, accessible status updates and dialogs, local game recovery, a service worker, and installable PWA metadata.
