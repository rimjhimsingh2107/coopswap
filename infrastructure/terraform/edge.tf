resource "aws_lb" "api" {
  name               = "coopswap-${var.env}"
  load_balancer_type = "application"
  subnets            = module.vpc.public_subnets
  security_groups    = [aws_security_group.alb.id]
  idle_timeout       = 120 # long enough for socket.io pings
}

resource "aws_lb_target_group" "api" {
  name        = "coopswap-${var.env}-api"
  port        = 4000
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = module.vpc.vpc_id
  deregistration_delay = 30

  health_check {
    path    = "/healthz"
    matcher = "200"
  }
  # sticky for socket.io's polling fallback. plain websockets don't need it
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 3600
  }
}

resource "aws_acm_certificate" "alb" {
  count             = var.domain != "" ? 1 : 0
  domain_name       = "origin.${var.domain}"
  validation_method = "DNS"
}

# with a domain we get a cert and cloudfront talks https to the alb. without
# one (quick staging) the alb only accepts cloudfront's ip ranges over http.
resource "aws_lb_listener" "main" {
  load_balancer_arn = aws_lb.api.arn
  port              = var.domain != "" ? 443 : 80
  protocol          = var.domain != "" ? "HTTPS" : "HTTP"
  certificate_arn   = var.domain != "" ? aws_acm_certificate.alb[0].arn : null
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "coopswap-${var.env}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

# One domain for everything so session cookies stay first party:
#   /api/*, /socket.io/*  -> ALB (no caching, cookies + websockets forwarded)
#   everything else       -> the static web build in S3
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = var.domain != "" ? [var.domain] : []

  origin {
    origin_id                = "web"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id   = "api"
    domain_name = var.domain != "" ? "origin.${var.domain}" : aws_lb.api.dns_name
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = var.domain != "" ? "https-only" : "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
  }

  dynamic "ordered_cache_behavior" {
    for_each = ["/api/*", "/socket.io/*"]
    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = "api"
      viewer_protocol_policy   = "https-only"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    }
  }

  # client side routes: serve index.html for unknown paths
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = var.domain == ""
    acm_certificate_arn            = var.domain != "" ? aws_acm_certificate.cdn[0].arn : null
    ssl_support_method             = var.domain != "" ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }
}

resource "aws_acm_certificate" "cdn" {
  count             = var.domain != "" ? 1 : 0
  provider          = aws.us_east_1
  domain_name       = var.domain
  validation_method = "DNS"
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.web.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.main.arn } }
    }]
  })
}
