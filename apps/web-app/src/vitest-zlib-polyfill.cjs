/* eslint-disable @typescript-eslint/no-require-imports */
const zlib = require('node:zlib');

if (typeof zlib.createZstdDecompress !== 'function') {
  zlib.createZstdDecompress = () => {
    throw new Error('zstd decompression is not supported in this Node version');
  };
}
