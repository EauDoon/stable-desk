import { createCheckHandler } from "../server/http.mjs";
import { collect } from "../server/collector.mjs";
// Stateless public function. It holds no state, needs no credentials and
// accepts no caller-supplied URL: it fetches exactly one allowlisted public
// page and returns bounded extracted text. The browser decides what to keep.
export default createCheckHandler({ collector: collect });
