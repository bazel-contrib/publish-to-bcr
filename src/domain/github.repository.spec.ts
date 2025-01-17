import url from 'node:url';

describe('GitHubRepository', () => {
  test('foo', () => {
    const f = url.parse(
      'ssh://git@githubf.com:bazel-contrib/publish-to-bcr.git'
    );
    console.log(f);
    console.log(
      url.parse('https://github.com/bazel-contrib/publish-to-bcr.git')
    );
    console.log(url.parse('file://./foobar'));
  });
});
