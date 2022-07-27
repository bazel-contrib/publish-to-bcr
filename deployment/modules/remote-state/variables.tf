variable "project_id" {
    type = string
    description = "ID of the Google Cloud project in which to create the terraform state bucket"
}

variable "region" {
    type = string
    description = "Google Cloud region to deploy resources to"
    default = "us-west1"
}