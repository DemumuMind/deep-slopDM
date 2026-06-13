import * as vscode from 'vscode';
import type { ScanResult } from './scanner';

/**
 * Create the deep-slop status bar item.
 */
export function createStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = 'deep-slop';
  item.tooltip = 'deep-slop — click to scan workspace';
  item.command = 'deep-slop.scanWorkspace';
  item.show();
  return item;
}

/**
 * Update the status bar item with scan results.
 *
 * Display: "deep-slop 85/100"
 * Green >= 75, Yellow >= 50, Red < 50
 */
export function updateStatusBar(item: vscode.StatusBarItem, result: ScanResult): void {
  const score = result.score;
  item.text = `deep-slop ${score}/100`;

  // Pick color based on score thresholds
  if (score >= 75) {
    item.color = new vscode.ThemeColor('statusBar.foreground'); // default (green-friendly)
    item.text = `$(check) deep-slop ${score}/100`;
  } else if (score >= 50) {
    item.color = '#ffcc00'; // yellow
    item.text = `$(alert) deep-slop ${score}/100`;
  } else {
    item.color = '#ff4444'; // red
    item.text = `$(error) deep-slop ${score}/100`;
  }

  // Count by severity
  let errors = 0;
  let warnings = 0;
  let fixable = 0;

  for (const engine of result.engines) {
    for (const d of engine.diagnostics) {
      if (d.severity === 'error') { errors++; }
      if (d.severity === 'warning') { warnings++; }
      if (d.help) { fixable++; }
    }
  }

  item.tooltip = `Errors: ${errors}, Warnings: ${warnings}, Fixable: ${fixable}`;
  item.show();
}
