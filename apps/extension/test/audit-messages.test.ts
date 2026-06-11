import { describe, expect, it } from 'vitest';
import {
  isAuditBackgroundMessage,
  isAuditEvent,
  isAuditPageCommand,
} from '@/utils/audit-messages';
import { isSimulationMessage } from '@/utils/simulation';

// Defense-in-depth for the runtime.onMessage surfaces: any extension page (or
// a compromised renderer holding the extension's message port) can post
// arbitrary JSON, so the guards must reject malformed payloads silently
// instead of letting them reach handlers that assume the field types.

describe('isAuditEvent', () => {
  it('accepts the well-formed event family', () => {
    expect(isAuditEvent({ kind: 'auditStarted', tabId: 7 })).toBe(true);
    expect(isAuditEvent({ kind: 'auditResult', tabId: 7, url: 'https://x/', entries: [] })).toBe(
      true,
    );
    expect(isAuditEvent({ kind: 'auditStale', tabId: 7 })).toBe(true);
    expect(isAuditEvent({ kind: 'auditInvalidated', tabId: 7 })).toBe(true);
    expect(isAuditEvent({ kind: 'auditError', tabId: 7, error: 'boom' })).toBe(true);
  });

  it('rejects non-objects and unknown kinds', () => {
    expect(isAuditEvent(null)).toBe(false);
    expect(isAuditEvent('auditResult')).toBe(false);
    expect(isAuditEvent({ kind: 'somethingElse', tabId: 7 })).toBe(false);
  });

  it('rejects payloads with wrong field types', () => {
    expect(isAuditEvent({ kind: 'auditStale', tabId: '7' })).toBe(false);
    expect(isAuditEvent({ kind: 'auditResult', tabId: 7, url: 'https://x/', entries: {} })).toBe(
      false,
    );
    expect(isAuditEvent({ kind: 'auditResult', tabId: 7, entries: [] })).toBe(false); // no url
    expect(isAuditEvent({ kind: 'auditError', tabId: 7, error: 42 })).toBe(false);
    expect(isAuditEvent({ kind: 'auditStarted' })).toBe(false); // no tabId
  });
});

describe('isAuditBackgroundMessage', () => {
  it('accepts runAudit with a numeric tabId', () => {
    expect(isAuditBackgroundMessage({ kind: 'runAudit', tabId: 7 })).toBe(true);
  });

  it('rejects a missing or non-numeric tabId', () => {
    expect(isAuditBackgroundMessage({ kind: 'runAudit' })).toBe(false);
    expect(isAuditBackgroundMessage({ kind: 'runAudit', tabId: '7' })).toBe(false);
    expect(isAuditBackgroundMessage(null)).toBe(false);
  });
});

describe('isAuditPageCommand', () => {
  it('accepts the command family', () => {
    expect(isAuditPageCommand({ kind: 'rerunAudit' })).toBe(true);
    expect(isAuditPageCommand({ kind: 'clearOverlay' })).toBe(true);
    expect(isAuditPageCommand({ kind: 'teardownAudit' })).toBe(true);
    expect(isAuditPageCommand({ kind: 'updateOverlay', groups: {}, badges: {}, swatches: {} })).toBe(
      true,
    );
    expect(isAuditPageCommand({ kind: 'focusEntry', index: 3 })).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isAuditPageCommand({ kind: 'updateOverlay', groups: [], badges: {}, swatches: {} })).toBe(
      false,
    );
    expect(isAuditPageCommand({ kind: 'updateOverlay', groups: {}, badges: {} })).toBe(false);
    expect(isAuditPageCommand({ kind: 'focusEntry', index: '3' })).toBe(false);
    expect(isAuditPageCommand({ kind: 'focusEntry' })).toBe(false);
    expect(isAuditPageCommand(undefined)).toBe(false);
  });
});

describe('isSimulationMessage', () => {
  it('accepts the message family', () => {
    expect(isSimulationMessage({ kind: 'clear', tabId: 7 })).toBe(true);
    expect(isSimulationMessage({ kind: 'getState', tabId: 7 })).toBe(true);
    expect(
      isSimulationMessage({ kind: 'apply', tabId: 7, settings: { type: 'deutan', severity: 1 } }),
    ).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isSimulationMessage({ kind: 'clear' })).toBe(false); // no tabId
    expect(isSimulationMessage({ kind: 'getState', tabId: '7' })).toBe(false);
    expect(isSimulationMessage({ kind: 'apply', tabId: 7 })).toBe(false); // no settings
    expect(isSimulationMessage({ kind: 'apply', tabId: 7, settings: null })).toBe(false);
    expect(
      isSimulationMessage({ kind: 'apply', tabId: 7, settings: { type: 'deutan', severity: '1' } }),
    ).toBe(false);
    expect(isSimulationMessage({ kind: 'apply', tabId: 7, settings: { severity: 1 } })).toBe(false);
    expect(isSimulationMessage(42)).toBe(false);
  });
});
