terraform {
 backend "gcs" {
   bucket  = "" # Set this with terraform init -backend-config="bucket=<BUCKET_ID>"
   prefix  = "terraform/state"
 }
}
