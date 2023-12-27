# e2e tests

The end-to-end tests use a combination of fake and real services.

Email notifications are sent to a semi-real service called [Ethereal](https://ethereal.email/) which `nodemailer` natively supports.

GitHub and Google Secrets Manager are faked.

Arguably GitHub should not be faked given how important it is to the functioning of the app, but using it presents several challenges:

- At least two new GitHub orgs need to be created and maintained by the Bazel SIG: an org containing test ruleset repos along with a bazel-central-registry clone, and an org containing a fake canonical bazel-central-registry. This creates additional maintenance burden.
- Real repositories are shared resources so there may be difficulties with multiple developers running tests simultaneously. Repos being restored to pristine states between test runs could cause conflicts.
- Testing the full functionality requires multiple GitHub user handles and thus requires multiple test accounts to be managed.

Run with:

```bash
yarn e2e
```
