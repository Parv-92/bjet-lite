/**
 * Bjet Mobile - FileLifecycleService TypeScript Test Suite
 */

import { FileLifecycleService } from '../fileLifecycleService';
import { statementCandidateStore } from '../statementCandidateStore';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export async function runFileLifecycleServiceTests() {
  const service = new FileLifecycleService();

  // Test 1: Register and track URI
  await service.registerSourceFile('file:///data/user/0/com.bjet.mobile/cache/DocumentPicker/test.pdf');
  assert(
    service.getActiveSourceFile() === 'file:///data/user/0/com.bjet.mobile/cache/DocumentPicker/test.pdf',
    'Must return registered source file'
  );

  // Test 2: statementCandidateStore source URI
  statementCandidateStore.setSession(
    [{ localId: 'tx-1', amount: 200, direction: 'SENT' } as any],
    undefined,
    [],
    'file:///test.pdf'
  );
  assert(statementCandidateStore.getSourceFileUri() === 'file:///test.pdf', 'Store must hold sourceFileUri');
  statementCandidateStore.clearSession();
  assert(statementCandidateStore.getSourceFileUri() === undefined, 'clearSession must reset sourceFileUri');

  // Test 3: deleteFileSafely defensive handling
  const resNull = await service.deleteFileSafely(null);
  assert(resNull.success === true, 'null must return success');

  const resEmpty = await service.deleteFileSafely('');
  assert(resEmpty.success === true, 'empty string must return success');

  return true;
}
