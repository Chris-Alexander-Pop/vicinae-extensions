import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDuration,
  formatSubtitle,
  parseRkhunter,
  parseScanSummary,
  renderBar,
  type AvStatus,
} from "../src/status";

function status(partial: Partial<AvStatus>): AvStatus {
  return {
    clamdActive: true,
    signatures: 1,
    unofficialCount: 0,
    unofficialNames: [],
    scanRunning: false,
    scanPid: null,
    lastLog: null,
    lastSummary: null,
    rkhunterLog: null,
    rkhunter: null,
    progress: null,
    resumable: false,
    sigAge: {
      officialHours: null,
      officialLabel: "unknown",
      unofficialHours: null,
      unofficialLabel: "unknown",
    },
    ...partial,
  };
}

describe("formatDuration", () => {
  it("formats seconds", () => {
    assert.equal(formatDuration(12), "12s");
    assert.equal(formatDuration(75), "1m 15s");
    assert.equal(formatDuration(3720), "1h 2m");
    assert.equal(formatDuration(null), "…");
    assert.equal(formatDuration(-1), "…");
  });
});

describe("formatSubtitle", () => {
  it("shows live scan percent and ETA", () => {
    assert.equal(
      formatSubtitle(
        status({
          scanRunning: true,
          progress: {
            state: "scanning",
            startedAt: null,
            updatedAt: null,
            elapsedSec: 10,
            total: 100,
            done: 41,
            percent: 41,
            etaSec: 26 * 60,
            infected: 0,
            current: null,
            log: null,
            message: null,
          },
        }),
      ),
      "41% · ETA 26m 0s",
    );
  });

  it("shows counting, resume, clean, and infected", () => {
    assert.equal(
      formatSubtitle(status({ scanRunning: true, progress: {
        state: "counting", startedAt: null, updatedAt: null, elapsedSec: 0,
        total: null, done: 0, percent: null, etaSec: null, infected: 0,
        current: null, log: null, message: null,
      }})),
      "Counting files…",
    );
    assert.equal(
      formatSubtitle(status({ resumable: true, progress: {
        state: "interrupted", startedAt: null, updatedAt: null, elapsedSec: 0,
        total: null, done: 0, percent: 41, etaSec: null, infected: 0,
        current: null, log: null, message: null,
      }})),
      "Resume 41%",
    );
    assert.equal(
      formatSubtitle(status({ lastSummary: { infected: 0, scannedFiles: 3, found: [], time: null } })),
      "Clean",
    );
    assert.equal(
      formatSubtitle(status({ lastSummary: { infected: 2, scannedFiles: 3, found: [], time: null } })),
      "2 infected",
    );
  });
});

describe("parsers", () => {
  it("parses a ClamAV SCAN SUMMARY", () => {
    const summary = parseScanSummary(`
/tmp/eicar: Win.Test.EICAR_HDB-1 FOUND
----------- SCAN SUMMARY -----------
Infected files: 1
Scanned files: 12
Time: 1.2 sec
`);
    assert.equal(summary.infected, 1);
    assert.equal(summary.scannedFiles, 12);
    assert.equal(summary.found.length, 1);
    assert.match(summary.found[0] ?? "", /EICAR/);
  });

  it("returns nulls for malformed summary text", () => {
    const summary = parseScanSummary("not a clam log");
    assert.equal(summary.infected, null);
    assert.equal(summary.scannedFiles, null);
    assert.deepEqual(summary.found, []);
  });

  it("parses rkhunter totals", () => {
    const rk = parseRkhunter(`
Files checked: 10
Suspect files: 0
Possible rootkits: 0
No warnings were found
The system checks took: 4 seconds
`);
    assert.equal(rk.filesChecked, 10);
    assert.equal(rk.suspectFiles, 0);
    assert.equal(rk.rootkits, 0);
    assert.equal(rk.warnings, false);
  });
});

describe("renderBar", () => {
  it("fills a fixed-width bar", () => {
    const bar = renderBar(50, 10);
    assert.equal(bar.length, 10);
    assert.equal(bar.startsWith("█"), true);
  });
});
