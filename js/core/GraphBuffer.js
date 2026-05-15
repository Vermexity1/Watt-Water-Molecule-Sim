import { MAX_HISTORY } from "../config.js";

export class GraphBuffer {
  constructor(limit = MAX_HISTORY) {
    this.limit = limit;
    this.samples = [];
  }

  push(sample) {
    this.samples.push(sample);
    if (this.samples.length > this.limit) {
      this.samples.shift();
    }
  }

  clear() {
    this.samples.length = 0;
  }
}
