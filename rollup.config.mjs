import resolve from 'rollup-plugin-node-resolve';
import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'src/index.ts',
  output: [{
    file: 'dist/my-library.umd.js',
    format: 'umd',
    name: 'flymyai',
  },
  {
    file: 'dist/my-library.emd.js',
    format: 'esm',
    name: 'flymyai',
  }],
  plugins: [
    resolve(),
    typescript({ tsconfig: './tsconfig.json' }),
  ],
};
