# Infrastructure (AWS)

Nothing here has been applied. It's the target layout for a staging/production
deploy; `terraform apply` creates billable resources (NAT gateway, RDS,
ElastiCache, ALB, Fargate tasks), roughly $80–120/month for the defaults.

```
CloudFront ─┬─ /*            → S3 (static web build, private, OAC)
            └─ /api/*, /socket.io/* → ALB (sticky) → ECS Fargate api tasks (2+)
                                                       ├─ RDS Postgres 17 (source of truth)
                                                       ├─ ElastiCache Redis (ephemeral only)
                                                       └─ S3 images bucket (private, signed urls)
```

One domain for the app and the api keeps the session cookie first party and
means CSRF/Origin checks see a single origin.

## First time

```bash
cd infrastructure/terraform
terraform init
terraform apply -var env=staging -var github_repo=<owner>/coopswap
```

Then in GitHub: create an environment called `staging`, and add these
**variables** from the terraform outputs: `AWS_ROLE_ARN`, `AWS_REGION`,
`ECR_REPOSITORY`, `ECS_CLUSTER`, `WEB_BUCKET`, `CLOUDFRONT_ID`,
`PRIVATE_SUBNETS`, `API_SECURITY_GROUP`. No AWS keys are stored in GitHub; the
deploy workflow uses OIDC.

Email: create an SES SMTP credential, put `smtp://user:pass@email-smtp.<region>.amazonaws.com:587`
in a Secrets Manager secret and pass its ARN as `smtp_url_secret_arn`.

Not using Kubernetes on purpose: two stateless api tasks behind an ALB is all
this needs, and Fargate keeps that to one service definition.
