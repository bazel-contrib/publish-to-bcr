provider "google" {
  project = "publish-to-bcr-dev"
  region  = "us-west1"
}

module "webhook" {
    source = "../../modules/webhook"

    github_app_id =  "221842"
    github_bot_app_id =  "228146"
    bazel_central_registry = "publish-to-bcr-dev-registry/bazel-central-registry"
    notifications_email = "no-reply@aspect.dev"
    debug_email = "derek@aspect.dev"
    smtp_host = "in-v3.mailjet.com"
    smtp_port = 465
}