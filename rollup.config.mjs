import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

// Two bundles that package.json points at (main: UMD, module: ESM) and the
// declarations at dist/index.d.ts (types). Dependencies are bundled.
export default {
  input: "src/index.ts",
  output: [
    { file: "dist/my-library.umd.js", format: "umd", name: "flymyai-js-client" },
    { file: "dist/my-library.esm.js", format: "esm" },
  ],
  plugins: [
    resolve(),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: true,
      declarationDir: "dist",
      exclude: ["src/**/*.test.ts"],
    }),
  ],
};
