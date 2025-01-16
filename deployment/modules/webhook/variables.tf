
variable "project" {
  type        = string
  description = "Project ID of the GCP project to setup services in. Defaults to the default project ID in the google provider."
  default     = null
}

variable "region" {
  type        = string
  description = "The default region to setup services in. Defaults to the default region in the google provider."
  default     = null
}

variable "github_app_id" {
  type        = string
  description = "ID of the publish-to-bcr GitHub app"
}

variable "github_bot_app_id" {
  type        = string
  description = "ID of the GitHub app that publishes pull requests to a BCR"
}

variable "bazel_central_registry" {
  type        = string
  description = "Bazel central registry to publish to"
}

variable "notifications_email" {
  type        = string
  description = "Email address that will send notifications"
}

variable "debug_email" {
  type        = string
  description = "Email address to notify development team of issues"
}

variable "smtp_host" {
  type        = string
  description = "SMTP host to use for sending emails"
}

variable "smtp_port" {
  type        = number
  description = "SMTP port to use for sending emails"
}