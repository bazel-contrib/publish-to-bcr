
terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
      version = "4.84.0"
    }
  }
}

data "google_client_config" "this" {}

locals {
  project = var.project != null ? var.project : data.google_client_config.this.project
  region =  var.region != null ? var.region : data.google_client_config.this.region
}

resource "google_storage_bucket" "source_archive_bucket" {
  name     = "${local.project}-source-archive-bucket"
  location = local.region
}

resource "google_storage_bucket_object" "publish_to_bcr_function_bucket_object" {
  name   = "source.${filemd5("${path.module}/../../../bazel-bin/src/cloudfunction.zip")}"
  bucket = google_storage_bucket.source_archive_bucket.name
  source = "${path.module}/../../../bazel-bin/src/cloudfunction.zip"
}

resource "google_cloudfunctions_function" "publish_to_bcr_function" {
  name        = "github-webhook"
  description = "Handle incoming github events"
  runtime     = "nodejs20"

  available_memory_mb   = 1024
  source_archive_bucket = google_storage_bucket.source_archive_bucket.name
  source_archive_object = google_storage_bucket_object.publish_to_bcr_function_bucket_object.name
  trigger_http          = true
  https_trigger_security_level = "SECURE_ALWAYS"
  ingress_settings = "ALLOW_ALL"
  entry_point           = "handleGithubWebhookEvent"
  timeout = 240

  environment_variables = {
    GITHUB_APP_ID = var.github_app_id,
    GITHUB_BOT_APP_ID = var.github_bot_app_id,
    BAZEL_CENTRAL_REGISTRY = var.bazel_central_registry,
    NOTIFICATIONS_EMAIL = var.notifications_email,
    DEBUG_EMAIL = var.debug_email,
    SMTP_HOST = var.smtp_host,
    SMTP_PORT = var.smtp_port,
  }
}

# Publicly invokable webhook. Requests from GitHub are authenticated
# inside the function.
resource "google_cloudfunctions_function_iam_member" "invoker" {
  project        = local.project
  region         = local.region
  cloud_function = google_cloudfunctions_function.publish_to_bcr_function.name

  role   = "roles/cloudfunctions.invoker"
  member = "allUsers"
}

resource "google_secret_manager_secret" "github_app_webhook_secret" {
  secret_id = "github-app-webhook-secret"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_app_webhook_secret_binding" {
  project = local.project
  secret_id = google_secret_manager_secret.github_app_webhook_secret.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${local.project}@appspot.gserviceaccount.com"
  ]
}

resource "google_secret_manager_secret" "github_app_private_key" {
  secret_id = "github-app-private-key"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_app_private_key_binding" {
  project = local.project
  secret_id = google_secret_manager_secret.github_app_private_key.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${local.project}@appspot.gserviceaccount.com"
  ]
}

resource "google_secret_manager_secret" "github_app_client_id" {
  secret_id = "github-app-client-id"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_app_client_id_binding" {
  project = local.project
  secret_id = google_secret_manager_secret.github_app_client_id.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${local.project}@appspot.gserviceaccount.com"
  ]
}

resource "google_secret_manager_secret" "github_app_client_secret" {
  secret_id = "github-app-client-secret"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_app_client_secret_binding" {
  project = local.project
  secret_id = google_secret_manager_secret.github_app_client_secret.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${local.project}@appspot.gserviceaccount.com"
  ]
}

resource "google_secret_manager_secret" "github_bot_app_private_key" {
  secret_id = "github-bot-app-private-key"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_bot_app_private_key_binding" {
  project = local.project
  secret_id = google_secret_manager_secret.github_bot_app_private_key.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${local.project}@appspot.gserviceaccount.com"
  ]
}

resource "google_secret_manager_secret" "github_bot_app_client_id" {
  secret_id = "github-bot-app-client-id"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_bot_app_client_id_binding" {
  project = local.project
  secret_id = google_secret_manager_secret.github_bot_app_client_id.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${local.project}@appspot.gserviceaccount.com"
  ]
}

resource "google_secret_manager_secret" "github_bot_app_client_secret" {
  secret_id = "github-bot-app-client-secret"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "github_bot_app_client_secret_binding" {
  project = local.project
  secret_id = google_secret_manager_secret.github_bot_app_client_secret.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${local.project}@appspot.gserviceaccount.com"
  ]
}


resource "google_secret_manager_secret" "notifications_email_user" {
  secret_id = "notifications-email-user"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "notifications_email_user_binding" {
  project = local.project
  secret_id = google_secret_manager_secret.notifications_email_user.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${local.project}@appspot.gserviceaccount.com"
  ]
}

resource "google_secret_manager_secret" "notifications_email_password" {
  secret_id = "notifications-email-password"

  replication {
    user_managed {
      replicas {
        location = local.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_binding" "notifications_email_password_binding" {
  project = local.project
  secret_id = google_secret_manager_secret.notifications_email_password.secret_id
  role = "roles/secretmanager.secretAccessor"
  members = [
    "serviceAccount:${local.project}@appspot.gserviceaccount.com"
  ]
}
