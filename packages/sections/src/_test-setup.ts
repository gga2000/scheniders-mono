// Per-test isolation shared by every section suite. The direct-order form
// keeps a per-tab draft in sessionStorage (helpers/order-draft), and jsdom
// keeps one window per test FILE — without this, a draft typed in one test
// would be restored into the next test's form. Node-environment suites have
// no window and are untouched.
import { afterEach } from "vitest";

afterEach(() => {
  if (typeof window !== "undefined") window.sessionStorage.clear();
});
