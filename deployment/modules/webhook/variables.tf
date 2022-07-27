
variable "project_id" {
    type = string
    description = "ID of the Google Cloud project to deploy resources under"
}

variable "region" {
    type = string
    description = "Google Cloud region to deploy resources to"
}

variable "github_app_id" {
    type = string
    description = "ID of the publish-to-bcr GitHub app"
}

variable "bazel_central_registry" {
    type = string
    description = "Bazel central registry to publish to"
}