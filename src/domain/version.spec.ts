import { compareVersions } from "./version";

describe("compareVersions", () => {
  it("should sort semvers", () => {
    expect(
      [
        "2.0.0",
        "1.0.0",
        "0.32.1",
        "0.32.11",
        "2.11.0",
        "1.0.0-rc1",
        "1.0.0-rc0",
        "1.0.0-rc23",
        "1.0.1-rc1",
        "2.10.1",
      ].sort(compareVersions)
    ).toEqual([
      "0.32.1",
      "0.32.11",
      "1.0.0-rc0",
      "1.0.0-rc1",
      "1.0.0-rc23",
      "1.0.0",
      "1.0.1-rc1",
      "2.0.0",
      "2.10.1",
      "2.11.0",
    ]);
  });

  it("should sort versions with more than 3 components", () => {
    expect(["6.4.0.2", "6.4.0", "6.4.0.2-rc0"].sort(compareVersions)).toEqual([
      "6.4.0",
      "6.4.0.2-rc0",
      "6.4.0.2",
    ]);
  });

  it("should sort duplciates", () => {
    expect(["1.0.0", "2.0.0", "1.0.0"].sort(compareVersions)).toEqual([
      "1.0.0",
      "1.0.0",
      "2.0.0",
    ]);
  });

  it("should sort versions with non-numeric identifiers", () => {
    expect(
      ["z", "b.aa.b", "a.ab.b-rcfoo", "a.ab.b", "a.ab.a", "a.aa.b", "x.y"].sort(
        compareVersions
      )
    ).toEqual([
      "a.aa.b",
      "a.ab.a",
      "a.ab.b-rcfoo",
      "a.ab.b",
      "b.aa.b",
      "x.y",
      "z",
    ]);
  });

  it("should sort numeric and non-numeric identifiers", () => {
    expect(["x.7.z", "1.2.3", "x.6.y", "a.b.c"].sort(compareVersions)).toEqual([
      "1.2.3",
      "a.b.c",
      "x.6.y",
      "x.7.z",
    ]);
  });
});
