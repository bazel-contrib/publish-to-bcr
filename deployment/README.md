# Deployment

This will walk you through deploying the Publish to BCR app.

If the app has already been deployed, see [Setup for existing deployment](#setup-for-existing-deployment).

## First time setup

### Create GitHub apps

Create two GitHub applications:

1. Webhook app: responds to ruleset release events and publish an new entry to a Bazel Central Registry fork.
2. Bot App: posts pull requests to the Bazel Central Registry.

Technically we could use one Github app, but we want to minimize the permissions granted to any
app by the BCR. The Bot app's permissions are restricted to posting pull requests and is the one
that gets installed to the BCR. The Webhook app is installed onto ruleset repos and BCR forks, and
is responsible for pushing new entries to the fork.

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

### Initialize terraform state

```bash
(cd deployment/environments/dev && bazel run terraform -- init)
```

### Deploy the app

```bash
(cd deployment/environments/dev && bazel run terraform -- apply)
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

#### Bot App

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

Enter secrets to authenticate with an SMTP server for sending notifications:

- `notifications-email-user`
- `notifications-email-password`

### Add apps to dev environment and BCR

You may wish to setup a ruleset, BCR fork, and (fake) BCR for testing. Install the Webhook App you
created for this environment to the ruleset repository and the BCR fork. Install the Bot App to
the fake BCR.

## Setup for existing deployment

Follow these steps if an environment has already been setup and deployed to a Google Cloud Platform project.

### Initialize terraform state

If the environment is already deployed then the terraform state bucket should exist.
Find and take note of the bucket id.

Change to the directory of the environment you want to deploy to and initialize the terraform state.

```bash
(cd deployment/environments/dev && bazel run terraform -- init)
```

### Deploy the app

```bash
(cd deployment/environments/dev && bazel run terraform -- apply)
```
