
provider "google" {
  project = "publish-to-bcr-prod"
  region  = "us-west1"
}

module "webhook" {
    source = "../../modules/webhook"

    github_app_id =  "196878"
    github_bot_app_id =  "234555"
    bazel_central_registry = "bazelbuild/bazel-central-registry"
    notifications_email = "no-reply@aspect.dev"
    debug_email = "derek@aspect.dev"
    smtp_host = "in-v3.mailjet.com"
    smtp_port = 465
}
