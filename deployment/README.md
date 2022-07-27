# Deployment

This will walk you through deploying the Publish to BCR app.

To deploy a new instance of the app, see [First time setup](#first-time-setup). To deploy to an already existing
instance, see [Setup for existing deployment](#setup-for-existing-deployment).

## First time setup

Follow these steps to deploy an app environment for the first time.

### Create GitHub app

Create a new GitHub application.

### Create project

Create a new Project on your Google Cloud Platform account. There will be one project per environment. You can
set up the development environment first and then repeat the steps for a produdction environment.

### Enable APIs

Go to the [API dashboard](https://console.cloud.google.com/apis/) and enable the following APIs. Note that this
isn't done via terraform as there are issues with eventual consistency. If you run terraform in a later step
and see an error indicating that one of these APIs isn't enabled, you may just have to wait several minutes before
trying again.

- Secrets
- Cloud Functions
- Cloud Build

### Deploy state bucket

Deploy a bucket that will contain the terraform state for the current project/environment. This lets you safely
run terraform commands from any machine to deploy to the same environment.

You can create the bucket manually, or you can set it up using the [remote state module](modules/remote-state/).
Note that this is a standalone root terraform module that is separate from the rest of the terraform managed
resources due to limitations with terraform and not being able to pass the bucket dynamically as a backend.

### Initialize terraform backend

Change to the environment directory and initialize the backend, passing the id of the state bucket created above.

```shell
cd deployment/environments/dev
terraform init -backend-config="bucket=<BUCKET_ID>"
```

### Build the app

```shell
yarn install
yarn build
```

### Deploy the app

Run terraform apply to deploy the application, passing the id of the GitHub app you created.
Note that you may wish to customize other variables from their defaults in [variables.tf](environments/dev/variables.tf).

```shell
terraform apply --var "github_app_id=<GITHUB_APP_ID>"
```

### Setup webhook

Activate the Webhook in your GitHub app settings and set the url to the trigger url of the deployed cloud function.
Generate a Webhook Secret and copy it for the next step. The secret lets us verify that incoming requests to our
cloud function are indeed from GitHub.

### Set app permissions

The GitHub app requires the following permissions to be set in order to function correctly.
Enable these under the app settings.

Under Repository permissions, set:

- Contents (read & write)
- Pull requests (read & write)

Under Event subscriptions, check:

- Release

### Input secrets

Open the [Secret Manager](https://console.cloud.google.com/security/secret-manager) for your Google Cloud Project
and new secret versions for each of the secrets:

- `github-app-webhook-secret` (see [Setup webhook](#setup-webhook))
- `github-app-client-id` (visible in app settings)
- `github-app-client-secret` (generated in app settings)
- `github-app-private-key` (generated in app settings)

### Add app to dev environment and BCR

You may wish to setup a ruleset, BCR fork, and (fake) BCR for testing. Install the GitHub app you
created for this environment to those repositories.

## Setup for existing deployment

Follow these steps if a GitHub already exists and has been deployed to a Google Cloud Platform project.

### Initialize terraform backend

If the environment is already deployed then the terraform state bucket should exist.
Find and take note of the bucket id.

Change to the directory of the environment you want to deploy to and initialize the backend, passing the bucket id.

```shell
cd deployment/environments/dev
terraform init -backend-config="bucket=<BUCKET_ID>"
```

### Build the app

```shell
yarn install
yarn build
```

### Deploy the app

Run terraform apply to deploy the application, passing the id of the existing GitHub app.
Note that you may wish to customize other variables from their defaults in [variables.tf](environments/dev/variables.tf).

```shell
terraform apply --var "github_app_id=<GITHUB_APP_ID>"
```
