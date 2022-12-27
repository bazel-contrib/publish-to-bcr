module "webhook" {
    source = "../../modules/webhook"

    project_id = var.project_id
    region = var.region
    github_app_id =  var.github_app_id
    github_bot_app_id =  var.github_bot_app_id
    bazel_central_registry = var.bazel_central_registry
    notifications_email = var.notifications_email
    debug_email = var.debug_email
    smtp_host = var.smtp_host
    smtp_port = var.smtp_port
}