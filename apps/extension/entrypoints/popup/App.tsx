import { CORE_PLACEHOLDER } from '@dichroma/core';

// TODO(M2): real simulator UI. Importing CORE_PLACEHOLDER proves the
// @dichroma/core workspace link compiles end-to-end.
export default function App() {
  return <main>{CORE_PLACEHOLDER ? 'dichroma' : null}</main>;
}
