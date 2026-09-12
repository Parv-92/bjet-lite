/**
 * Bjet Mobile - Performance Diagnostic Logger
 * [DIAGNOSTIC INSTRUMENTATION - TEMPORARY]
 * Provides structured, standardized logging for performance profiling.
 */
import { useRef, useEffect } from 'react';

export function logPerfRender(
  component: string,
  renderCount: number,
  reason: string,
  extra?: Record<string, any>
) {
  const ts = new Date().toISOString();
  console.log(
    `[PERF][RENDER]\nComponent: ${component}\nRender count: ${renderCount}\nTimestamp: ${ts}\nReason: ${reason}${
      extra ? `\nDetails: ${JSON.stringify(extra)}` : ''
    }`
  );
}

export function logPerfApi(
  method: string,
  url: string,
  startTime: number,
  endTime: number,
  status: number | string,
  sizeBytes?: number
) {
  const duration = endTime - startTime;
  console.log(
    `[PERF][API]\nEndpoint: ${method.toUpperCase()} ${url}\nStart: ${new Date(
      startTime
    ).toISOString()}\nEnd: ${new Date(
      endTime
    ).toISOString()}\nDuration: ${duration} ms\nStatus: ${status}${
      sizeBytes !== undefined ? `\nResponse Size: ${sizeBytes} bytes` : ''
    }`
  );
}

export function logPerfOcr(
  stage: string,
  durationMs: number,
  inputInfo: string,
  outputInfo: string,
  extra?: Record<string, any>
) {
  console.log(
    `[PERF][OCR]\nStage: ${stage}\nDuration: ${durationMs} ms\nInput: ${inputInfo}\nOutput: ${outputInfo}${
      extra ? `\nExtra: ${JSON.stringify(extra)}` : ''
    }`
  );
}

export function logPerfNav(
  action: string,
  durationMs: number,
  details?: string
) {
  console.log(
    `[PERF][NAV]\nAction: ${action}\nDuration: ${durationMs} ms\nTimestamp: ${new Date().toISOString()}${
      details ? `\nDetails: ${details}` : ''
    }`
  );
}

export function useRenderDiagnostic(
  componentName: string,
  stateOrProps?: Record<string, any>,
  enabled: boolean = true
) {
  const countRef = useRef(0);
  const prevRef = useRef<Record<string, any> | undefined>(undefined);

  useEffect(() => {
    if (enabled) {
      prevRef.current = stateOrProps;
    }
  });

  if (!enabled) return;

  countRef.current += 1;
  const renderCount = countRef.current;

  let reason = 'Initial mount';
  if (renderCount > 1) {
    if (stateOrProps && prevRef.current) {
      const changedKeys: string[] = [];
      const keys = new Set([...Object.keys(stateOrProps), ...Object.keys(prevRef.current)]);
      for (const k of keys) {
        if (stateOrProps[k] !== prevRef.current[k]) {
          changedKeys.push(k);
        }
      }
      reason = changedKeys.length > 0 ? `Changed props/state: ${changedKeys.join(', ')}` : 'Parent re-render / Hook update';
    } else {
      reason = 'Re-render (state or parent update)';
    }
  }

  logPerfRender(componentName, renderCount, reason);

  useEffect(() => {
    prevRef.current = stateOrProps;
  });
}
