# Deployment

This will walk you through deploying the Publish to BCR app.

To deploy a new instance of the app, see [First time setup](#first-time-setup). To deploy to an already existing
instance, see [Setup for existing deployment](#setup-for-existing-deployment).

## First time setup

Follow these steps to deploy an app environment for the first time.

### Create GitHub apps

You must create two GitHub applications, the Webhook App which will respond to ruleset release
events and publish an new entry to a fork, as well as a Bot App which posts pull requests to the
Bazel Central Registry.

The purpose of the Bot App is to use a more restricted set of permissions when installed to
the Bazel Central Registry compared to the more permissive permissions required on the Webhook
App which is installed to ruleset repositories and BCR forks.

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

Run terraform apply to deploy the application, passing the id of the GitHub apps you created.
Note that you may wish to customize other variables from their defaults in [variables.tf](environments/dev/variables.tf).

```shell
terraform apply --var "github_app_id=<GITHUB_APP_ID>" --var "github_bot_app_id=<GITHUB_BOT_APP_ID>"
```

### Setup webhook

Activate the Webhook in the GitHub Webhook App settings and set the url to the trigger url of the deployed cloud function.
Generate a Webhook Secret and copy it for the next step. The secret lets us verify that incoming requests to our
cloud function are indeed from GitHub.

### Set app permissions

The two GitHub apps requires the following permissions to be set in order to function correctly.
Enable these under the app settings.

#### Webhook App

Under Repository permissions, set:

- Contents (read & write)

Under Event subscriptions, check:

- Release

### Bot App

Under Repository permissions, set:

- Pull requests (read & write)

### Input secrets

Open the [Secret Manager](https://console.cloud.google.com/security/secret-manager) for your Google Cloud Project
and new secret versions for each of the Webhook App secrets:

- `github-app-webhook-secret` (see [Setup webhook](#setup-webhook))
- `github-app-client-id` (visible in app settings)
- `github-app-client-secret` (generated in app settings)
- `github-app-private-key` (generated in app settings)

Similarly enter secrets for the Bot App:

- `github-bot-app-client-id` (visible in app settings)
- `github-bot-app-client-secret` (generated in app settings)
- `github-bot-app-private-key` (generated in app settings)

### Add apps to dev environment and BCR

You may wish to setup a ruleset, BCR fork, and (fake) BCR for testing. Install the Webhook App you
created for this environment to the ruleset repository and the BCR fork. Install the Bot App to
the fake BCR.

## Setup for existing deployment

Follow these steps if an environment has already been setup and deployed to a Google Cloud Platform project.

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
terraform apply --var "github_app_id=<GITHUB_APP_ID>" --var "github_bot_app_id=<GITHUB_BOT_APP_ID>"
```
