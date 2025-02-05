# e2e tests

Run with

```bash
pnpm run e2e
```

Requires `gcloud` application default credentials. The e2e tests stub google cloud APIs and
don't actually use the credentials, however the file `~/.config/gcloud/application_default_credentials.json`
must still exist and be valid for the `@google-cloud` node clients to work properly.

```bash
gcloud auth application-default login
```

## Test strategy

The end-to-end tests use a combination of fake and real services.

The full webhook is run locally using [Functions Framework](https://cloud.google.com/functions/docs/functions-framework), which is the same runtime that Google Cloud Functions uses.

Email notifications are sent to an email test service called [Ethereal](https://ethereal.email/), which our email client `nodemailer` natively supports.

GitHub and Google Secrets Manager are stubbed. It may seem counterintuitive to stub GitHub when testing a GitHub app, however, using the real service presents several challenges:

- The Bazel SIG would need to maintain a fleet of other GitHub organizations, repositories, and users for testing, creating additional maintenance burden.
- Test repositories need to be kept in a pristine state across test runs. Simultaneous test runs could cause conflicts in test results and require that only one individual runs tests at a time.

In the current state, tests can be run locally, simultaneously with other developers with no resource contention. The GitHub API is well-defined and easy enough to stub with test data.
