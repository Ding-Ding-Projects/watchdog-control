// Pure transition rules shared by the supervisor and focused behavior tests.
class Recovery {
  constructor(limit = 6) { this.limit = limit; this.attempts = 0; this.failures = 0; this.notified = null; }
  healthy() { this.failures = 0; }
  disconnected() { return ++this.failures >= 3; }
  restartDelay() { return this.attempts >= this.limit ? null : Math.min(60000, 2000 * 2 ** this.attempts++); }
  needsNotification(url) { return Boolean(url && url !== this.notified); }
  acknowledge(url) { this.notified = url; }
}
class NotificationDelivery {
  constructor(limit = 3) { this.limit = limit; this.records = new Map(); }
  record(url) {
    if (!this.records.has(url)) this.records.set(url, { attempts: 0, delivered: false });
    return this.records.get(url);
  }
  canSend(url) { const record = this.record(url); return !record.delivered && record.attempts < this.limit; }
  attempt(url) { if (!this.canSend(url)) return false; this.record(url).attempts++; return true; }
  acknowledge(url) { this.record(url).delivered = true; }
}
module.exports = { Recovery, NotificationDelivery };
