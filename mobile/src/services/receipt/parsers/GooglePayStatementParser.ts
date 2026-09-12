/**
 * Bjet Mobile - Google Pay Statement Parser (Phase 7)
 *
 * Implements high-fidelity segmentation and parsing for multi-page Google Pay
 * transaction statements (such as the 11-page GPay statement from Phase 6).
 *
 * Requirements:
 * - Identifies individual transaction rows across page boundaries.
 * - Extracts Date, Time, Direction, Counterparty, UPI Transaction ID, and Amount.
 * - Explicitly models direction: SENT, RECEIVED, TOP_UP, UNKNOWN.
 * - Statement totals ('Sent ₹32,006', 'Received ₹16,971') remain statement metadata,
 *   and are NEVER imported as transaction candidates.
 * - Stores UPI Transaction IDs as exact strings (e.g. '621338418329').
 * - Preserves sourcePage and sourceText for review audit evidence.
 * - Isolates row failures so partial parsing succeeds.
 */

import {
  TransactionCandidate,
  StatementMetadata,
} from '../../../types/receiptInterpretation';
import { IDocumentParser, ParsedDocument } from './types';

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

export class GooglePayStatementParser implements IDocumentParser {
  public name = 'GooglePayStatementParser';

  public canParse(rawText: string): boolean {
    if (!rawText) return false;
    const isStatement =
      /transaction\s+statement/i.test(rawText) ||
      /statement\s+period/i.test(rawText);
    const hasGpaySignatures =
      /google\s+pay/i.test(rawText) ||
      /upi\s+lite/i.test(rawText) ||
      /paid\s+by\s+upi\s+lite/i.test(rawText) ||
      /date\s*&\s*time\s+transaction\s+details\s+amount/i.test(rawText);

    return isStatement && hasGpaySignatures;
  }

  public async parse(
    rawText: string,
    metadata?: { pageCount?: number; fileName?: string }
  ): Promise<ParsedDocument> {
    const candidates: TransactionCandidate[] = [];
    const warnings: string[] = [];

    // 1. Extract Statement-Level Summary Metadata
    const statementMetadata = this.extractStatementMetadata(rawText);

    // 2. Separate text into pages (using Phase 6 page boundaries '--- PAGE X ---' or full body)
    const pages = this.splitIntoPages(rawText);

    let localIdCounter = 1;

    for (const page of pages) {
      const pageText = page.text;

      // Detect Columnar Layout (typical of mobile OCR such as ML Kit on Android)
      // vs Row-Linear Layout (typical of direct PDF text extraction)
      const dIdx = pageText.search(/Date\s*&\s*time/i);
      const tIdx = pageText.search(/Transaction\s+details/i);
      const aIdx = pageText.search(/Amount/i);

      const dateSection =
        dIdx !== -1 && tIdx !== -1 && dIdx < tIdx
          ? pageText.slice(dIdx, tIdx)
          : '';
      const hasDatesInDateSection =
        /(\d{1,2}\s+[A-Za-z]+[.,]?\s+\d{4}\s*\n\s*[\dO]{1,2}:\d{2}\s+(?:AM|PM))/i.test(
          dateSection
        );
      const isColumnar =
        dIdx !== -1 &&
        tIdx !== -1 &&
        aIdx !== -1 &&
        dIdx < tIdx &&
        tIdx < aIdx &&
        hasDatesInDateSection;

      if (isColumnar) {
        // --- COLUMNAR LAYOUT (ML Kit OCR) ---
        const pageCandidates = this.parseColumnarPage(
          pageText,
          page.pageNumber,
          localIdCounter,
          dIdx,
          tIdx,
          aIdx
        );
        localIdCounter += pageCandidates.length;
        candidates.push(...pageCandidates);
      } else {
        // --- ROW-LINEAR LAYOUT (PDF.js direct text) ---
        // Locate table content: Skip summary headers up to 'Date & time   Transaction details   Amount'
        const tableHeaderIdx = pageText.search(
          /Date\s*&\s*time\s+Transaction\s+details\s+Amount/i
        );
        const tableBody =
          tableHeaderIdx !== -1 ? pageText.slice(tableHeaderIdx) : pageText;

        // Anchor transaction block boundaries:
        // Match explicit date & time: "01 Aug, 2026 \n11:22 AM"
        const anchorRegex =
          /(\d{1,2}\s+[A-Za-z]+,?\s+\d{4}\s*\n\s*\d{1,2}:\d{2}\s+(?:AM|PM))/g;
        let match: RegExpExecArray | null;
        const blockStarts: { index: number }[] = [];

        while ((match = anchorRegex.exec(tableBody)) !== null) {
          blockStarts.push({ index: match.index });
        }

        for (let i = 0; i < blockStarts.length; i++) {
          const start = blockStarts[i].index;
          const end =
            i + 1 < blockStarts.length ? blockStarts[i + 1].index : tableBody.length;
          const blockText = tableBody.slice(start, end).trim();

          try {
            const candidate = this.parseTransactionBlock(
              blockText,
              page.pageNumber,
              `cand_${localIdCounter++}`
            );

            if (candidate) {
              candidates.push(candidate);
            }
          } catch (err: any) {
            warnings.push(
              `Page ${page.pageNumber} row parse error: ${err?.message || 'Malformed transaction'}`
            );
          }
        }
      }
    }

    if (candidates.length === 0) {
      warnings.push(
        'No transaction rows could be confidently segmented from statement.'
      );
    } else {
      this.disambiguateAndReconcileAmounts(candidates, statementMetadata);
    }

    return {
      candidates,
      statementMetadata,
      warnings,
    };
  }

  /**
   * Parses a columnar table layout produced by mobile OCR (e.g. Google ML Kit on Android),
   * where Date & time, Transaction details, and Amount form separate vertical blocks.
   */
  private parseColumnarPage(
    pageText: string,
    pageNumber: number,
    startIdCounter: number,
    dIdx: number,
    tIdx: number,
    aIdx: number
  ): TransactionCandidate[] {
    const candidates: TransactionCandidate[] = [];

    // 1. Date column extraction
    const dateSection = pageText.slice(dIdx, tIdx);
    const dateRegex =
      /(\d{1,2}\s+[A-Za-z]+[.,]?\s+\d{4}\s*\n\s*[\dO]{1,2}:\d{2}\s+(?:AM|PM))/gi;
    const rawDates: string[] = [];
    let dateMatch: RegExpExecArray | null;
    while ((dateMatch = dateRegex.exec(dateSection)) !== null) {
      rawDates.push(dateMatch[1]);
    }

    // 2. Transaction details column extraction
    const detailSection = pageText.slice(
      tIdx + 'Transaction details'.length,
      aIdx
    );
    const cleanedLines = detailSection
      .split('\n')
      .map(l => l.trim())
      .filter(
        l =>
          l &&
          !/^\d{10},?$/i.test(l) &&
          !/^Powered by/i.test(l) &&
          !/^Transaction statement/i.test(l) &&
          !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i.test(l) &&
          !/^UPI[»>]/i.test(l) &&
          !/^Sent$/i.test(l) &&
          !/^Received$/i.test(l) &&
          !/^[\d,]+$/i.test(l)
      );

    const txBlocks: string[][] = [];
    let currentLines: string[] = [];
    for (const line of cleanedLines) {
      currentLines.push(line);
      // Boundary marker: payment method line closes a transaction entry
      if (/Paid\s+by/i.test(line) || /Paid\s+to\s+Bank/i.test(line)) {
        txBlocks.push(currentLines);
        currentLines = [];
      }
    }
    if (currentLines.length > 0) {
      txBlocks.push(currentLines);
    }

    // 3. Amount column extraction
    const amountSection = pageText.slice(aIdx);
    const amountLines = amountSection
      .split('\n')
      .map(l => l.trim())
      .filter(
        l =>
          l &&
          !/^Amount$/i.test(l) &&
          !/^Note:/i.test(l) &&
          !/^received\./i.test(l) &&
          !/^Page\s+\d+/i.test(l)
      );

    const rowCount = Math.max(
      rawDates.length,
      txBlocks.length,
      amountLines.length
    );

    for (let i = 0; i < rowCount; i++) {
      const block = txBlocks[i] || [];
      const blockStr = block.join('\n');

      // UPI Transaction ID (exact 12-digit string, normalize OCR letter 'O' to digit '0')
      const upiMatch = blockStr.match(
        /UPI\s+Transaction\s+ID[:\s]+([0-9O]{12})/i
      );
      const transactionReference = upiMatch
        ? upiMatch[1].replace(/O/g, '0')
        : undefined;

      // Direction & Merchant extraction
      let direction: 'SENT' | 'RECEIVED' | 'TOP_UP' | 'UNKNOWN' = 'UNKNOWN';
      let merchantRawName: string | undefined = undefined;
      const warnings: string[] = [];

      if (/Top-up to UPI Lite/i.test(blockStr)) {
        direction = 'TOP_UP';
        // TOP_UP has no external merchant/counterparty (not forced to fake name)
        merchantRawName = undefined;
        warnings.push('Internal wallet top-up transfer (not consumer expenditure).');
      } else if (/Received from/i.test(blockStr)) {
        direction = 'RECEIVED';
        const m = blockStr.match(/Received\s+from\s*([^\n]*)/i);
        const name = m && m[1] ? m[1].trim() : '';
        // Extract counterparty when explicitly present in source, no fabricated names
        merchantRawName =
          name && !/^UPI\s+Transaction/i.test(name) ? name : undefined;
        warnings.push('Received funds / credit (not consumer expenditure).');
      } else {
        // Sent transaction: Find Paid to line (excluding bank settlement line "Paid to Bank of India")
        const paidLine = block.find(l =>
          /Paid\s*to\s*(?!Bank\s+of\s+India)/i.test(l)
        );
        if (paidLine) {
          direction = 'SENT';
          const m = paidLine.match(/Paid\s*to\s*(.*)/i);
          merchantRawName = m && m[1] ? m[1].trim() : undefined;
        } else if (/Paid\s+by/i.test(blockStr)) {
          direction = 'SENT';
        }
      }

      const timestamp = this.parseDateString(rawDates[i]);
      const amount = this.parseAmountString(amountLines[i]);

      if (amount === undefined) {
        warnings.push('Amount could not be detected in block.');
      }
      if (!timestamp) {
        warnings.push('Date/time format ambiguous or not found.');
      }
      if (!transactionReference) {
        warnings.push('UPI Reference ID missing.');
      }
      if (!merchantRawName && direction !== 'TOP_UP') {
        warnings.push('Counterparty or merchant name could not be identified.');
      }

      let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (
        amount !== undefined &&
        timestamp &&
        transactionReference &&
        (merchantRawName || direction === 'TOP_UP')
      ) {
        confidence = 'HIGH';
      } else if (amount !== undefined && (timestamp || merchantRawName)) {
        confidence = 'MEDIUM';
      }

      const reviewStatus =
        confidence === 'HIGH' && direction === 'SENT'
          ? 'READY_FOR_REVIEW'
          : 'NEEDS_ATTENTION';

      candidates.push({
        localId: `cand_${startIdCounter + i}`,
        merchantRawName,
        amount,
        currency: 'INR',
        timestamp,
        transactionReference,
        paymentApp: 'Google Pay',
        direction,
        confidence,
        warnings,
        sourcePage: pageNumber,
        sourceText: [rawDates[i], blockStr, amountLines[i]]
          .filter(Boolean)
          .join('\n'),
        reviewStatus,
        isExcluded: false,
      });
    }

    return candidates;
  }

  /**
   * Strictly parses an amount string structurally located in the Amount column.
   * Handles optional currency symbols and common OCR noise (₹, Rs., INR, T, Z, R)
   * while rejecting arbitrary non-currency text.
   */
  private parseAmountString(str?: string): number | undefined {
    if (!str) return undefined;
    const clean = str.trim();
    const prefixMatch = clean.match(
      /^(?:₹|Rs\.?|INR|[TZR])?\s*([\d,]+(?:\.\d{1,2})?)$/i
    );
    if (!prefixMatch) return undefined;
    const numStr = prefixMatch[1].replace(/,/g, '');
    const val = parseFloat(numStr);
    return isNaN(val) ? undefined : val;
  }

  /**
   * Disambiguates OCR amounts across candidates using structural evidence
   * (commas in thousands, UPI Lite limits, payee thresholds) and statement-level
   * financial reconciliation as a final consistency check.
   *
   * If an amount remains genuinely ambiguous, preserves the ambiguity and
   * surfaces it as NEEDS_ATTENTION rather than inventing a value.
   */
  private disambiguateAndReconcileAmounts(
    candidates: TransactionCandidate[],
    metadata?: StatementMetadata
  ): void {
    const totalSent = metadata?.totalSentReported;
    const totalReceived = metadata?.totalReceivedReported;

    interface PreparedItem {
      candidate: TransactionCandidate;
      rawStr: string;
      amount?: number;
      isAmbiguous: boolean;
      options: number[];
    }

    // Step 1: Initial local structural analysis
    const prepared: PreparedItem[] = candidates.map(c => {
      // Extract raw amount line from the end of sourceText
      const sourceLines = (c.sourceText || '')
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
      const raw = sourceLines.length > 0 ? sourceLines[sourceLines.length - 1] : '';
      const isUpiLite = /UPI\s+Lite/i.test(c.sourceText || '');
      const direction = c.direction || 'UNKNOWN';
      const isTopUp = direction === 'TOP_UP';

      // 1. Explicit currency symbol or prefix (₹, Rs., INR, T, Z, R)
      const stdPrefixMatch = raw.match(
        /^(?:₹|Rs\.?|INR|[TZR])\s*([\d,]+(?:\.\d{1,2})?)$/i
      );
      if (stdPrefixMatch) {
        const val = parseFloat(stdPrefixMatch[1].replace(/,/g, ''));
        return { candidate: c, rawStr: raw, amount: val, isAmbiguous: false, options: [val] };
      }

      // 2. Pure number string (with optional commas/decimals)
      const numMatch = raw.match(/^([\d,]+(?:\.\d{1,2})?)$/);
      if (!numMatch) {
        return { candidate: c, rawStr: raw, amount: c.amount, isAmbiguous: false, options: [] };
      }

      const numStr = numMatch[1];
      const rawVal = parseFloat(numStr.replace(/,/g, ''));

      // If it does not start with 7 or 2, it is structurally unambiguous
      if (!numStr.startsWith('7') && !numStr.startsWith('2')) {
        return { candidate: c, rawStr: raw, amount: rawVal, isAmbiguous: false, options: [rawVal] };
      }

      // Starts with 7 or 2: check plausible stripped option
      const strippedStr = numStr.slice(1).replace(/,/g, '');
      const strippedVal = strippedStr ? parseFloat(strippedStr) : null;
      if (strippedVal === null || isNaN(strippedVal) || strippedVal <= 0) {
        return { candidate: c, rawStr: raw, amount: rawVal, isAmbiguous: false, options: [rawVal] };
      }

      // Structural Rule A: Comma formatting (e.g. "72,217" -> 2217, "72,000" -> 2000, "22,000" -> 2000, "73,250" -> 3250)
      // When a spurious prefix is attached to a comma-formatted thousands number,
      // the unstripped amount (e.g. 72,217 or 22,000) exceeds statement total or wallet limits,
      // whereas the stripped amount restores the valid thousands number (2,217 or 2,000).
      if (
        numStr.includes(',') &&
        (numStr.startsWith('7') || numStr.startsWith('2')) &&
        rawVal > 16000
      ) {
        return { candidate: c, rawStr: raw, amount: strippedVal, isAmbiguous: false, options: [strippedVal] };
      }

      // Structural Rule B: UPI Lite channel & wallet limits (NPCI cap: max ₹500 transaction, ₹2,000 wallet)
      if (isUpiLite && rawVal > 500) {
        return { candidate: c, rawStr: raw, amount: strippedVal, isAmbiguous: false, options: [strippedVal] };
      }
      if (isTopUp && rawVal > 2000) {
        return { candidate: c, rawStr: raw, amount: strippedVal, isAmbiguous: false, options: [strippedVal] };
      }

      // Structural Rule C: Payee context - lump-sum investments (MUTUAL FUNDS NCL)
      if (
        /MUTUAL\s+FUNDS/i.test(c.merchantRawName || '') &&
        !/AUTOPAY/i.test(c.merchantRawName || '') &&
        rawVal >= 500
      ) {
        return { candidate: c, rawStr: raw, amount: rawVal, isAmbiguous: false, options: [rawVal] };
      }

      // Otherwise, it is ambiguous between rawVal and strippedVal
      return {
        candidate: c,
        rawStr: raw,
        amount: rawVal,
        isAmbiguous: true,
        options: [strippedVal, rawVal],
      };
    });

    // Step 2: Statement-level consistency & reconciliation pass
    const reconcileGroup = (group: PreparedItem[], targetTotal?: number) => {
      if (!targetTotal || typeof targetTotal !== 'number') {
        group.forEach(item => {
          if (item.isAmbiguous) {
            item.candidate.warnings.push(
              `Ambiguous amount detected in OCR: '${item.rawStr}'. Could be ₹${item.options[0]} or ₹${item.options[1]}.`
            );
            item.candidate.confidence = 'MEDIUM';
            item.candidate.reviewStatus = 'NEEDS_ATTENTION';
          }
        });
        return;
      }

      const fixedItems = group.filter(item => !item.isAmbiguous);
      const ambiguousItems = group.filter(item => item.isAmbiguous);

      if (ambiguousItems.length === 0) return;

      const fixedSum = fixedItems.reduce((sum, it) => sum + (it.amount || 0), 0);
      const remainingTarget = Math.round((targetTotal - fixedSum) * 100) / 100;

      const n = ambiguousItems.length;
      const minSuffix = new Array(n + 1).fill(0);
      const maxSuffix = new Array(n + 1).fill(0);

      for (let i = n - 1; i >= 0; i--) {
        const opts = ambiguousItems[i].options;
        const minOpt = Math.min(...opts);
        const maxOpt = Math.max(...opts);
        minSuffix[i] = minSuffix[i + 1] + minOpt;
        maxSuffix[i] = maxSuffix[i + 1] + maxOpt;
      }

      const solutions: number[][] = [];
      const dfs = (idx: number, currSum: number, picks: number[]) => {
        if (solutions.length >= 10) return;
        if (idx === n) {
          if (Math.abs(currSum - remainingTarget) < 0.05) {
            solutions.push([...picks]);
          }
          return;
        }
        if (currSum + minSuffix[idx] > remainingTarget + 0.05) return;
        if (currSum + maxSuffix[idx] < remainingTarget - 0.05) return;

        const item = ambiguousItems[idx];
        for (const opt of item.options) {
          picks.push(opt);
          dfs(idx + 1, currSum + opt, picks);
          picks.pop();
        }
      };

      dfs(0, 0, []);

      if (solutions.length === 1) {
        const best = solutions[0];
        ambiguousItems.forEach((item, i) => {
          item.amount = best[i];
          item.isAmbiguous = false;
        });
      } else if (solutions.length > 1) {
        // Resolve only the items where all mathematically valid solutions agree
        for (let i = 0; i < n; i++) {
          const firstVal = solutions[0][i];
          const allAgree = solutions.every(sol => sol[i] === firstVal);
          if (allAgree) {
            ambiguousItems[i].amount = firstVal;
            ambiguousItems[i].isAmbiguous = false;
          }
        }
        ambiguousItems.forEach(item => {
          if (item.isAmbiguous) {
            item.candidate.warnings.push(
              `Ambiguous amount detected in OCR: '${item.rawStr}'. Could be ₹${item.options[0]} or ₹${item.options[1]}.`
            );
            item.candidate.confidence = 'MEDIUM';
            item.candidate.reviewStatus = 'NEEDS_ATTENTION';
          }
        });
      } else {
        ambiguousItems.forEach(item => {
          item.candidate.warnings.push(
            `Ambiguous amount detected in OCR: '${item.rawStr}'. Could be ₹${item.options[0]} or ₹${item.options[1]}.`
          );
          item.candidate.confidence = 'MEDIUM';
          item.candidate.reviewStatus = 'NEEDS_ATTENTION';
        });
      }
    };

    reconcileGroup(
      prepared.filter(c => c.candidate.direction === 'SENT'),
      totalSent
    );
    reconcileGroup(
      prepared.filter(c => c.candidate.direction === 'RECEIVED'),
      totalReceived
    );
    const topUpGroup = prepared.filter(c => c.candidate.direction === 'TOP_UP');
    if (topUpGroup.length > 0 && metadata?.totalTopUpReported) {
      reconcileGroup(topUpGroup, metadata.totalTopUpReported);
    }

    // Step 3: Apply resolved amounts and recalculate confidence / reviewStatus
    prepared.forEach(item => {
      const c = item.candidate;
      if (item.amount !== undefined) {
        c.amount = item.amount;
      }

      if (
        !item.isAmbiguous &&
        c.amount !== undefined &&
        c.timestamp &&
        c.transactionReference &&
        (c.merchantRawName || c.direction === 'TOP_UP')
      ) {
        c.confidence = 'HIGH';
        if (c.direction === 'SENT') {
          c.reviewStatus = 'READY_FOR_REVIEW';
        } else {
          c.reviewStatus = 'NEEDS_ATTENTION';
        }
      } else if (item.isAmbiguous) {
        c.confidence = 'MEDIUM';
        c.reviewStatus = 'NEEDS_ATTENTION';
      }
    });
  }

  /**
   * Parses standard Google Pay statement date/time format.
   */
  private parseDateString(str?: string): string | undefined {
    if (!str) return undefined;
    const m = str.match(
      /(\d{1,2})\s+([A-Za-z]+)[.,]?\s+(\d{4})\s*\n?\s*([\dO]{1,2}):(\d{2})\s+(AM|PM)/i
    );
    if (!m) return undefined;
    const day = parseInt(m[1], 10);
    const monthStr = m[2].slice(0, 3).toLowerCase();
    const year = parseInt(m[3], 10);
    const hourStr = m[4].replace(/O/g, '0');
    let hour = parseInt(hourStr, 10);
    const minute = parseInt(m[5], 10);
    const ampm = m[6].toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    const month = MONTH_MAP[monthStr] || '01';
    return `${year}-${month}-${String(day).padStart(2, '0')}T${String(
      hour
    ).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
  }

  /**
   * Parses statement-level metadata (period, total sent/received).
   * Ensures these are NOT treated as transaction candidates.
   */
  private extractStatementMetadata(text: string): StatementMetadata {
    const meta: StatementMetadata = {};

    // Period e.g. "01 August 2026 - 31 August 2026"
    const periodMatch = text.match(
      /Transaction\s+statement\s+period\s*\n\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4}\s*-\s*[0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/i
    );
    if (periodMatch) {
      const parts = periodMatch[1].split('-').map(s => s.trim());
      meta.periodStart = parts[0];
      meta.periodEnd = parts[1];
    }

    // Summary totals on Page 1: "Sent \n₹32,006", "Received \n₹16,971"
    const sentMatch = text.match(/Sent\s*\n\s*[₹7T]?\s*([\d,]+(?:\.\d{2})?)/i);
    if (sentMatch) {
      meta.totalSentReported = parseFloat(sentMatch[1].replace(/,/g, ''));
    }

    const receivedMatch = text.match(/Received\s*\n\s*[₹7T]?\s*([\d,]+(?:\.\d{2})?)/i);
    if (receivedMatch) {
      meta.totalReceivedReported = parseFloat(receivedMatch[1].replace(/,/g, ''));
    }

    // Account identifiers (email/phone)
    const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      meta.accountIdentifier = emailMatch[1];
    }

    return meta;
  }

  /**
   * Splits raw text by Phase 6 page boundaries '--- PAGE X ---'.
   */
  private splitIntoPages(rawText: string): { pageNumber: number; text: string }[] {
    const pageRegex = /---\s*PAGE\s+(\d+)\s*---/gi;
    const matches: { pageNum: number; index: number }[] = [];
    let m: RegExpExecArray | null;

    while ((m = pageRegex.exec(rawText)) !== null) {
      matches.push({ pageNum: parseInt(m[1], 10), index: m.index });
    }

    if (matches.length === 0) {
      return [{ pageNumber: 1, text: rawText }];
    }

    const pages: { pageNumber: number; text: string }[] = [];
    for (let i = 0; i < matches.length; i++) {
      const pageNum = matches[i].pageNum;
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
      pages.push({
        pageNumber: pageNum,
        text: rawText.slice(start, end),
      });
    }

    return pages;
  }

  /**
   * Parses an individual transaction block into a strongly typed TransactionCandidate.
   */
  private parseTransactionBlock(
    blockText: string,
    pageNumber: number,
    localId: string
  ): TransactionCandidate | null {
    const warnings: string[] = [];

    // 1. Amount Extraction (e.g. ₹80, ₹2,217, ₹1,000)
    const amountMatch = blockText.match(/₹\s*([\d,]+(?:\.\d{1,2})?)/);
    const amount = amountMatch
      ? parseFloat(amountMatch[1].replace(/,/g, ''))
      : undefined;

    if (amount === undefined || isNaN(amount)) {
      warnings.push('Amount could not be detected in block.');
    }

    // 2. Timestamp Extraction (Date + Time)
    const dateTimeMatch = blockText.match(
      /(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})\s*\n\s*(\d{1,2}):(\d{2})\s+(AM|PM)/i
    );
    let timestamp: string | undefined;

    if (dateTimeMatch) {
      const day = parseInt(dateTimeMatch[1], 10);
      const monthStr = dateTimeMatch[2].slice(0, 3).toLowerCase();
      const year = parseInt(dateTimeMatch[3], 10);
      let hour = parseInt(dateTimeMatch[4], 10);
      const minute = parseInt(dateTimeMatch[5], 10);
      const ampm = dateTimeMatch[6].toUpperCase();

      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;

      const month = MONTH_MAP[monthStr] || '01';
      timestamp = `${year}-${month}-${String(day).padStart(2, '0')}T${String(
        hour
      ).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
    } else {
      warnings.push('Date/time format ambiguous or not found.');
    }

    // 3. Direction & Counterparty Extraction
    // Check Top-up and Received from FIRST to avoid false positives with bank payment line
    let direction: 'SENT' | 'RECEIVED' | 'TOP_UP' | 'UNKNOWN' = 'UNKNOWN';
    let merchantRawName: string | undefined;

    if (/Top-up to UPI Lite/i.test(blockText)) {
      direction = 'TOP_UP';
      merchantRawName = undefined;
      warnings.push('Internal wallet top-up transfer (not consumer expenditure).');
    } else if (/Received from/i.test(blockText)) {
      direction = 'RECEIVED';
      const m = blockText.match(/Received from\s*(.*?)(?:\n|UPI\s+Transaction)/is);
      const name = m && m[1] ? m[1].trim() : '';
      merchantRawName =
        name && !/^UPI\s+Transaction/i.test(name) ? name : undefined;
      warnings.push('Received funds / credit (not consumer expenditure).');
    } else if (/Paid to\s+/i.test(blockText)) {
      direction = 'SENT';
      const m = blockText.match(/Paid to\s+(.*?)(?:\n|UPI\s+Transaction)/is);
      merchantRawName = m && m[1] ? m[1].trim() : undefined;
    }

    if (!merchantRawName && direction !== 'TOP_UP') {
      warnings.push('Counterparty or merchant name could not be identified.');
    }

    // 4. UPI Transaction ID Extraction (must remain exact string)
    const upiMatch = blockText.match(/UPI\s+Transaction\s+ID[:\s]+(\d+)/i);
    const transactionReference = upiMatch ? upiMatch[1].trim() : undefined;

    if (!transactionReference) {
      warnings.push('UPI Reference ID missing.');
    }

    // 5. Confidence Calculation
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (
      amount !== undefined &&
      timestamp &&
      transactionReference &&
      (merchantRawName || direction === 'TOP_UP')
    ) {
      confidence = 'HIGH';
    } else if (amount !== undefined && (timestamp || merchantRawName)) {
      confidence = 'MEDIUM';
    }

    const reviewStatus =
      confidence === 'HIGH' && direction === 'SENT'
        ? 'READY_FOR_REVIEW'
        : 'NEEDS_ATTENTION';

    return {
      localId,
      merchantRawName,
      amount,
      currency: 'INR',
      timestamp,
      transactionReference,
      paymentApp: 'Google Pay',
      direction,
      confidence,
      warnings,
      sourcePage: pageNumber,
      sourceText: blockText,
      reviewStatus,
      isExcluded: false,
    };
  }
}
