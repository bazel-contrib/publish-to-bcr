module "webhook" {
    source = "../../modules/webhook"

    project_id = var.project_id
    region = var.region
    github_app_id =  var.github_app_id
    bazel_central_registry = var.bazel_central_registry
}