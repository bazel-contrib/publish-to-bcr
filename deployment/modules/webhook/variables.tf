
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

variable "github_bot_app_id" {
    type = string
    description = "ID of the GitHub app that publishes pull requests to a BCR"
}

variable "bazel_central_registry" {
    type = string
    description = "Bazel central registry to publish to"
}

variable "notifications_email" {
    type = string
    description = "Email address that will send notifications"
}

variable "smtp_host" {
    type = string
    description = "SMTP host to use for sending emails"
}

variable "smtp_port" {
    type = number
    description = "SMTP port to use for sending emails"
}