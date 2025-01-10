import path from "path";

// Because jest snapshot tests run in the build directory, we need to map
// the saved snapshot location back to the source tree.
export function resolveSnapshotPath(testPath, snapshotExtension) {
  const pathInSourceTree = path.relative("build", testPath);
  const dirname = path.dirname(pathInSourceTree);
  return path.join(
    dirname,
    "__snapshots__",
    path.basename(pathInSourceTree).replace(".js", ".ts.snap")
  );
}

export function resolveTestPath(snapshotFilePath, snapshotExtension) {
  return path
    .join("build", snapshotFilePath.replace("__snapshots__", ""))
    .replace(".ts.snap", ".js");
}

export const testPathForConsistencyCheck = "e2e/e2e.spec.js";

export default {
  resolveSnapshotPath,
  resolveTestPath,
  testPathForConsistencyCheck,
};
