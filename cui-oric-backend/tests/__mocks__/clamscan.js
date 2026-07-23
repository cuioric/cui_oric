class MockClamScan {
  init() {
    return this;
  }

  async getVersion() {
    return '0.103.0';
  }

  async scanBuffer() {
    return { isInfected: false, viruses: [] };
  }
}

module.exports = MockClamScan;