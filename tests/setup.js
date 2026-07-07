class MockWorker {
  constructor() {
    this.postMessage = () => {};
    this.terminate = () => {};
    this.onmessage = null;
    this.onerror = null;
  }
}

globalThis.Worker = MockWorker;
