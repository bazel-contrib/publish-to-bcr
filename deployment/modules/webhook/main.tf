resource "google_storage_bucket" "source_archive_bucket" {
  name     = "source-archive-bucket"
  location = var.region
}

data "archive_file" "publish_to_bcr_function_archive" {
  type        = "zip"
  source_dir = "../../../dist/publish-to-bcr"
  output_path = "../../../dist/publish-to-bcr.zip"
}

resource "google_storage_bucket_object" "publish_to_bcr_function_bucket_object" {
  name   = "source.${data.archive_file.publish_to_bcr_function_archive.output_md5}"
  bucket = google_storage_bucket.source_archive_bucket.name
  source = data.archive_file.publish_to_bcr_function_archive.output_path
}

resource "google_cloudfunctions_function" "publish_to_bcr_function" {
  name        = "github-webhook"
  description = "Handle incoming github events"
  runtime     = "nodejs16"

  available_memory_mb   = 128
  source_archive_bucket = google_storage_bucket.source_archive_bucket.name
  source_archive_object = google_storage_bucket_object.publish_to_bcr_function_bucket_object.name
  trigger_http          = true
  https_trigger_security_level = "SECURE_ALWAYS"
  ingress_settings = "ALLOW_ALL"
  entry_point           = "handleGithubWebhookEvent"
  timeout = 240

  environment_variables = {
    GITHUB_APP_ID = var.github_app_id
    BAZEL_CENTRAL_REGISTRY = var.bazel_central_registry
  }
}

# Publicly invokable webhook. Requests from GitHub are authenticated
# inside the function.
resource "google_cloudfunctions_function_iam_member" "invoker" {
  project        = var.project_id
  region         = var.region
  cloud_function = google_cloudfunctions_function.publish_to_bcr_function.name

  role   = "roles/cloudfunctions.invoker"
  member = "allUsers"
}

resource "google_secret_manager_secret" "github_app_webhook_secret" {
  secret_id = "github-app-webhook-secret"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_app_webhook_secret_binding" {
  project = var.project_id
  secret_id = google_secret_manager_secret.github_app_webhook_secret.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${var.project_id}@appspot.gserviceaccount.com"
  ]
}

resource "google_secret_manager_secret" "github_app_private_key" {
  secret_id = "github-app-private-key"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_app_private_key_binding" {
  project = var.project_id
  secret_id = google_secret_manager_secret.github_app_private_key.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${var.project_id}@appspot.gserviceaccount.com"
  ]
}

resource "google_secret_manager_secret" "github_app_client_id" {
  secret_id = "github-app-client-id"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_app_client_id_binding" {
  project = var.project_id
  secret_id = google_secret_manager_secret.github_app_client_id.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${var.project_id}@appspot.gserviceaccount.com"
  ]
}

resource "google_secret_manager_secret" "github_app_client_secret" {
  secret_id = "github-app-client-secret"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_app_client_secret_binding" {
  project = var.project_id
  secret_id = google_secret_manager_secret.github_app_client_secret.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${var.project_id}@appspot.gserviceaccount.com"
  ]
}
