# Alarms e-mail var.alert_email (AWS sends one confirmation e-mail first; nothing arrives until it is confirmed).
# All of them use free EC2 metrics; each alarm costs $0.10 a month (Sydney, Pricing API 2026-11-04).
resource "aws_sns_topic" "alerts" {
  name = "${local.prefix}-alerts"
}
resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  instance_dim = { InstanceId = aws_instance.server.id }
}

# AWS hardware or network trouble: move the server to healthy hardware automatically (same disks, same address)
resource "aws_cloudwatch_metric_alarm" "system_check" {
  alarm_name          = "${local.prefix}-server-system-check"
  alarm_description   = "The server's host failed; EC2 recovers it onto healthy hardware."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  dimensions          = local.instance_dim
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = ["arn:aws:automate:${var.region}:ec2:recover", aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# the operating system stopped answering: reboot it
resource "aws_cloudwatch_metric_alarm" "instance_check" {
  alarm_name          = "${local.prefix}-server-instance-check"
  alarm_description   = "The server stopped responding; EC2 reboots it."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  dimensions          = local.instance_dim
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = ["arn:aws:automate:${var.region}:ec2:reboot", aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# CPU credits running out: the server is about to slow to its baseline. Time to move the worker out or step up (docs/AWS_ARCHITECTURE.md, scale triggers).
resource "aws_cloudwatch_metric_alarm" "cpu_credits" {
  alarm_name          = "${local.prefix}-server-cpu-credits-low"
  alarm_description   = "CPU credits are low: the server will slow down. See the scale triggers in docs/AWS_ARCHITECTURE.md."
  namespace           = "AWS/EC2"
  metric_name         = "CPUCreditBalance"
  dimensions          = local.instance_dim
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 3
  threshold           = 30
  comparison_operator = "LessThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "${local.prefix}-server-cpu-high"
  alarm_description   = "CPU above 60% for an hour: a scale trigger (docs/AWS_ARCHITECTURE.md)."
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  dimensions          = local.instance_dim
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 12
  threshold           = 60
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}
