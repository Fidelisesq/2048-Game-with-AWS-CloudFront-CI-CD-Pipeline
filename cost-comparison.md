# Monthly Cost Comparison: Serverless vs. ECS Fargate

**Updated:** August 2026 | **Region:** US East (N. Virginia) | **Currency:** USD

## Current deployed architecture
The project uses S3, CloudFront, Route 53, API Gateway HTTP API, Lambda, DynamoDB, ACM, and CloudWatch. The game executes in each player's browser; Lambda only handles leaderboard requests. There is no EC2, ECS, Fargate, ALB, NAT Gateway, or continuously running server. The Lambda@Edge function is provisioned but not associated with CloudFront, so it has no invocation cost.

### Assumptions for 10,000 monthly players
- Deployed static files: 174,751 bytes (about 171 KB); conservatively assume one full download per player, or about 1.7 GB/month.
- About 5–6 CloudFront requests and 2 API requests per player (one leaderboard read and one score submission).
- Lambda: 128 MB, approximately 100 ms per invocation; DynamoDB items remain below billing-unit size limits.
- Existing Route 53 hosted zone, no WAF, backups, provisioned concurrency, or paid CloudFront plan.

### Estimated monthly AWS cost
| Service | Usage assumption | Estimated cost |
|---|---:|---:|
| CloudFront | ~1.7 GB and ~60,000 requests; below 1 TB/10M always-free allowance | $0.00 |
| S3 Standard | <1 MB stored plus small origin/deployment request volume | <$0.01 |
| API Gateway HTTP API | ~20,000 requests at $1.00/million after introductory benefits | ~$0.02 |
| Lambda | ~20,000 requests; below 1M requests/400,000 GB-s monthly allowance | $0.00 |
| DynamoDB on-demand | ~10,000 reads and writes; includes GSI write usage | ~$0.01–$0.02 |
| Route 53 | One hosted zone; alias queries to CloudFront are free | $0.50 |
| ACM certificate | Public certificate used by CloudFront | $0.00 |
| CloudWatch Logs | Small Lambda log volume | $0.00–$0.05 |
| **Estimated total** | **10,000 monthly players** | **$0.50–$0.60/month** |

## Traffic scenarios
| Monthly players | Approx. transfer | Approx. API calls | Estimated total |
|---:|---:|---:|---:|
| 1,000 | 0.17 GB | 2,000 | ~$0.50 |
| 10,000 | 1.7 GB | 20,000 | ~$0.50–$0.60 |
| 100,000 | 17 GB | 200,000 | ~$0.80–$1.25 |
| 1,000,000 | 171 GB | 2,000,000 | ~$4–$6 |

## Hypothetical ECS Fargate alternative (10,000 players)
This is not deployed. It assumes one Linux/x86 task with 0.25 vCPU and 0.5 GB running continuously, an internet-facing ALB across at least two Availability Zones, ECR, CloudWatch, and public IPv4 charges.

| Component | Estimated monthly cost |
|---|---:|
| Fargate task | ~$9.01 |
| Application Load Balancer and light LCU usage | ~$16.43–$17.00 |
| Public IPv4 addresses | ~$7.30–$10.95 |
| ECR, Route 53, and CloudWatch | ~$1–$3 |
| **Estimated ECS total** | **~$34–$40/month** |

A private-subnet design with a NAT Gateway could add roughly $33/month before data processing. For this browser-heavy game, the deployed serverless architecture remains the appropriate and least expensive option.

## Notes and pricing sources
Free allowances are shared across the AWS account. Domain registration, taxes, GitHub Actions overages, traffic from other projects, and optional AWS features are excluded. Route 53's $0.50 hosted-zone cost is shared if the zone also serves other projects, making this project's incremental cost even lower. Actual charges should be verified in AWS Cost Explorer.

Sources: [CloudFront](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/), [S3](https://aws.amazon.com/s3/pricing/), [API Gateway](https://aws.amazon.com/api-gateway/pricing/), [Lambda](https://aws.amazon.com/lambda/pricing/), [DynamoDB](https://aws.amazon.com/dynamodb/pricing/), [Route 53](https://aws.amazon.com/route53/pricing/), [Fargate](https://aws.amazon.com/fargate/pricing/), [Elastic Load Balancing](https://aws.amazon.com/elasticloadbalancing/pricing/), and [public IPv4 pricing](https://aws.amazon.com/blogs/aws/new-aws-public-ipv4-address-charge-public-ip-insights/).

Content was rephrased for compliance with licensing restrictions.