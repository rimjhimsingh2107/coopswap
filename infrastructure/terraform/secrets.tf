resource "random_password" "session" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name = "coopswap/${var.env}/app"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DATABASE_URL   = "postgres://coopswap:${random_password.db.result}@${aws_db_instance.main.address}:5432/coopswap?sslmode=require"
    REDIS_URL      = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
    SESSION_SECRET = random_password.session.result
  })
}
