import { buildSvgFilter } from '@dichroma/core';

// TODO(M2): real simulator UI. Rendering buildSvgFilter's id proves the
// @dichroma/core workspace link compiles end-to-end.
export default function App() {
  return <main>{buildSvgFilter('deutan', 1).id}</main>;
}
