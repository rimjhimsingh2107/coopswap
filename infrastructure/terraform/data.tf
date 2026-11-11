resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_instance" "main" {
  identifier              = "coopswap-${var.env}"
  engine                  = "postgres"
  engine_version          = "17"
  instance_class          = var.db_instance_class
  allocated_storage       = 20
  max_allocated_storage   = 100
  storage_encrypted       = true
  db_name                 = "coopswap"
  username                = "coopswap"
  password                = random_password.db.result
  db_subnet_group_name    = module.vpc.database_subnet_group_name
  vpc_security_group_ids  = [aws_security_group.data.id]
  multi_az                = var.db_multi_az
  backup_retention_period = 7
  # point in time restore is the main recovery path, see docs/operations.md
  deletion_protection          = var.env == "production"
  skip_final_snapshot          = var.env != "production"
  final_snapshot_identifier    = "coopswap-${var.env}-final"
  performance_insights_enabled = true
  auto_minor_version_upgrade   = true
  parameter_group_name         = aws_db_parameter_group.main.name
}

resource "aws_db_parameter_group" "main" {
  name   = "coopswap-${var.env}-pg17"
  family = "postgres17"
  parameter {
    name  = "log_min_duration_statement"
    value = "250"
  }
  parameter {
    name  = "idle_in_transaction_session_timeout"
    value = "30000"
  }
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "coopswap-${var.env}"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "coopswap-${var.env}"
  description                = "rate limits, presence, socket.io fan-out. nothing durable."
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 1
  subnet_group_name          = aws_elasticache_subnet_group.main.name
  security_group_ids         = [aws_security_group.data.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false
}
