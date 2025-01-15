terraform {
  backend "gcs" {
    bucket = "bucket-tfstate-02793625b05b4e9a"
    prefix = "terraform/state"
  }
}
