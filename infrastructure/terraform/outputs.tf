output "url" { value = local.origin }
output "ecr_repository" { value = aws_ecr_repository.api.repository_url }
output "ecs_cluster" { value = aws_ecs_cluster.main.name }
output "web_bucket" { value = aws_s3_bucket.web.bucket }
output "cloudfront_id" { value = aws_cloudfront_distribution.main.id }
output "deploy_role_arn" { value = aws_iam_role.deploy.arn }
output "private_subnets" { value = join(",", module.vpc.private_subnets) }
output "api_security_group" { value = aws_security_group.api.id }
