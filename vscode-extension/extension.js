const vscode = require('vscode');
const { execFile } = require('child_process');
const path = require('path');

let diagnosticCollection;
let statusBarItem;
let outputChannel;

function activate(context) {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('deep-slop');
  outputChannel = vscode.window.createOutputChannel('Deep Slop');
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'deep-slop.scanWorkspace';

  context.subscriptions.push(
    vscode.commands.registerCommand('deep-slop.scanFile', () => scan(false)),
    vscode.commands.registerCommand('deep-slop.scanWorkspace', () => scan(true)),
    diagnosticCollection,
    outputChannel,
    statusBarItem
  );

  statusBarItem.text = '$(shield) Deep Slop';
  statusBarItem.show();
}

function deactivate() {}

async function scan(isWorkspace) {
  const config = vscode.workspace.getConfiguration('deep-slop');
  const cliPath = config.get('cliPath', '');
  const failBelow = config.get('failBelow', 70);

  // Resolve CLI path
  let deepSlopBin = cliPath || 'deep-slop';
  if (!cliPath && vscode.workspace.workspaceFolders) {
    // Try local node_modules first
    const local = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'node_modules', '.bin', 'deep-slop');
    deepSlopBin = local;
  }

  const target = isWorkspace
    ? (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '.')
    : vscode.window.activeTextEditor?.document.uri.fsPath || '.';

  if (!target || target === '.') {
    vscode.window.showWarningMessage('No file or workspace open');
    return;
  }

  vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Deep Slop scanning...' }, async () => {
    return new Promise((resolve) => {
      const args = ['scan', target, '--json'];
      if (!isWorkspace) args.push('--engine', 'ast-slop', 'dead-flow', 'import-intelligence');

      execFile(deepSlopBin, args, { maxBuffer: 50 * 1024 * 1024, timeout: 120000 }, (err, stdout, stderr) => {
        if (err && !stdout) {
          outputChannel.appendLine(`Error: ${err.message}`);
          if (stderr) outputChannel.appendLine(stderr);
          vscode.window.showErrorMessage(`Deep Slop failed: ${err.message}`);
          resolve();
          return;
        }

        if (stderr) {
          outputChannel.appendLine(stderr);
        }

        try {
          const result = JSON.parse(stdout);
          outputChannel.appendLine(`Score: ${result.score}/100`);
          outputChannel.appendLine(`Diagnostics: ${result.totalDiagnostics}`);

          // Update status bar
          const score = result.score;
          statusBarItem.text = `$(shield) Slop: ${score}/100`;
          statusBarItem.tooltip = `Deep Slop score: ${score}/100\n${result.totalDiagnostics} issues found`;
          if (score < failBelow) {
            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
          } else {
            statusBarItem.backgroundColor = undefined;
          }

          // Map diagnostics to VS Code problems
          diagnosticCollection.clear();
          const diagnosticsByFile = new Map();

          for (const engine of result.engines) {
            for (const diag of engine.diagnostics) {
              const filePath = path.isAbsolute(diag.filePath)
                ? diag.filePath
                : path.join(result.rootDirectory || '.', diag.filePath);
              const uri = vscode.Uri.file(filePath);

              if (!diagnosticsByFile.has(uri.toString())) {
                diagnosticsByFile.set(uri.toString(), []);
              }

              const severity = diag.severity === 'error' ? vscode.DiagnosticSeverity.Error
                : diag.severity === 'warning' ? vscode.DiagnosticSeverity.Warning
                : diag.severity === 'info' ? vscode.DiagnosticSeverity.Information
                : vscode.DiagnosticSeverity.Hint;

              const range = new vscode.Range(
                Math.max(0, (diag.line || 1) - 1), 0,
                Math.max(0, (diag.line || 1) - 1), 1000
              );

              const vdiag = new vscode.Diagnostic(range, diag.message, severity);
              vdiag.source = `deep-slop:${diag.rule}`;
              vdiag.code = diag.rule;
              diagnosticsByFile.get(uri.toString()).push(vdiag);
            }
          }

          for (const [uriStr, diags] of diagnosticsByFile) {
            diagnosticCollection.set(vscode.Uri.parse(uriStr), diags);
          }

          vscode.window.showInformationMessage(`Deep Slop: ${score}/100 (${result.totalDiagnostics} issues)`);
        } catch (e) {
          outputChannel.appendLine(`Parse error: ${e.message}`);
          outputChannel.appendLine(stdout);
          vscode.window.showErrorMessage(`Deep Slop output could not be parsed: ${e.message}`);
        }
        resolve();
      });
    });
  });
}

module.exports = { activate, deactivate };
