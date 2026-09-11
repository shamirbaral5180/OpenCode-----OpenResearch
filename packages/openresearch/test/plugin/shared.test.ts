import { describe, expect, test } from "bun:test"
import { parsePluginSpecifier } from "../../src/plugin/shared"

describe("parsePluginSpecifier", () => {
  test("parses standard npm package without version", () => {
    expect(parsePluginSpecifier("acme")).toEqual({
      pkg: "acme",
      version: "latest",
    })
  })

  test("parses standard npm package with version", () => {
    expect(parsePluginSpecifier("acme@1.0.0")).toEqual({
      pkg: "acme",
      version: "1.0.0",
    })
  })

  test("parses scoped npm package without version", () => {
    expect(parsePluginSpecifier("@openresearch/acme")).toEqual({
      pkg: "@openresearch/acme",
      version: "latest",
    })
  })

  test("parses scoped npm package with version", () => {
    expect(parsePluginSpecifier("@openresearch/acme@1.0.0")).toEqual({
      pkg: "@openresearch/acme",
      version: "1.0.0",
    })
  })

  test("parses package with git+https url", () => {
    expect(parsePluginSpecifier("acme@git+https://github.com/openresearch/acme.git")).toEqual({
      pkg: "acme",
      version: "git+https://github.com/openresearch/acme.git",
    })
  })

  test("parses scoped package with git+https url", () => {
    expect(parsePluginSpecifier("@openresearch/acme@git+https://github.com/openresearch/acme.git")).toEqual({
      pkg: "@openresearch/acme",
      version: "git+https://github.com/openresearch/acme.git",
    })
  })

  test("parses package with git+ssh url containing another @", () => {
    expect(parsePluginSpecifier("acme@git+ssh://git@github.com/openresearch/acme.git")).toEqual({
      pkg: "acme",
      version: "git+ssh://git@github.com/openresearch/acme.git",
    })
  })

  test("parses scoped package with git+ssh url containing another @", () => {
    expect(parsePluginSpecifier("@openresearch/acme@git+ssh://git@github.com/openresearch/acme.git")).toEqual({
      pkg: "@openresearch/acme",
      version: "git+ssh://git@github.com/openresearch/acme.git",
    })
  })

  test("parses unaliased git+ssh url", () => {
    expect(parsePluginSpecifier("git+ssh://git@github.com/openresearch/acme.git")).toEqual({
      pkg: "git+ssh://git@github.com/openresearch/acme.git",
      version: "",
    })
  })

  test("parses npm alias using the alias name", () => {
    expect(parsePluginSpecifier("acme@npm:@openresearch/acme@1.0.0")).toEqual({
      pkg: "acme",
      version: "npm:@openresearch/acme@1.0.0",
    })
  })

  test("parses bare npm protocol specifier using the target package", () => {
    expect(parsePluginSpecifier("npm:@openresearch/acme@1.0.0")).toEqual({
      pkg: "@openresearch/acme",
      version: "1.0.0",
    })
  })

  test("parses unversioned npm protocol specifier", () => {
    expect(parsePluginSpecifier("npm:@openresearch/acme")).toEqual({
      pkg: "@openresearch/acme",
      version: "latest",
    })
  })
})
