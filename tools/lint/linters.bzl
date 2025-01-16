"Create linter aspects, see https://github.com/aspect-build/rules_lint/blob/main/docs/linting.md#installation"

load("@aspect_rules_lint//lint:eslint.bzl", "lint_eslint_aspect")
load("@aspect_rules_lint//lint:lint_test.bzl", "lint_test")

eslint = lint_eslint_aspect(
    binary = "@@//tools/lint:eslint",
    configs = ["@@//:eslintrc"],
)

eslint_test = lint_test(aspect = eslint)
